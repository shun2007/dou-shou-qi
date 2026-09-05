/* ============================================================
 * llm.js — 斗兽棋大模型 AI 对手
 * 兼容任意 OpenAI 协议视觉/文本大模型（通义/豆包/智谱/DeepSeek等）
 * 大模型可决策：移动棋子 或 使用技能（含目标选择）
 * ============================================================ */

const LLM = {
  config: {
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    apiKey: '',
    model: 'ep-20260905174601-f8mmt',
    enabled: false,
    thinking: false
  },

  load() {
    try {
      const s = localStorage.getItem('doushouqi-llm');
      if (s) Object.assign(this.config, JSON.parse(s));
    } catch (e) {}
  },

  save() {
    localStorage.setItem('doushouqi-llm', JSON.stringify({
      baseUrl: this.config.baseUrl,
      apiKey: this.config.apiKey,
      model: this.config.model,
      enabled: this.config.enabled
    }));
  },

  /* ---------- 棋盘序列化 ---------- */
  serializeBoard(aiPl) {
    const lines = [];
    lines.push('斗兽棋棋盘 9行×7列。行号0(顶/蓝方)到8(底/红方)，列号0到6。');
    lines.push('地形标记：~河流 #陷阱 D兽穴。棋子=名称(等级)。');
    lines.push('');
    // header
    lines.push('   ' + Array.from({length: C}, (_, i) => i).join(' '));
    for (let r = 0; r < R; r++) {
      let row = (r < 10 ? ' ' : '') + r + ' ';
      for (let c = 0; c < C; c++) {
        let ch = '.';
        if (isRiver(r, c)) ch = '~';
        else if (isDenCell(r, c)) ch = 'D';
        else if (isTrapCell(r, c)) ch = '#';
        const pc = board[r][c];
        if (pc) ch = pc.n + (pc.pl === 1 ? '红' : '蓝');
        row += ch + (c < C - 1 ? ' ' : '');
      }
      lines.push(row);
    }
    lines.push('');
    // pieces list
    for (const pl of [1, 2]) {
      const tag = pl === 1 ? '红方' : '蓝方';
      const pieces = [];
      for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
        if (board[r][c] && board[r][c].pl === pl) {
          const pc = board[r][c];
          let extra = '';
          if (pc.buffs) {
            if (pc.buffs.inv > 0) extra += '[无敌' + pc.buffs.inv + ']';
            if (pc.buffs.kill > 0) extra += '[秒杀]';
            if (pc.buffs.hp > 0) extra += '[HP' + pc.buffs.hp + ']';
          }
          if (pc.lastStand > 0) extra += '[背水' + pc.lastStand + ']';
          if (pc.permaThrust) extra += '[永久加速]';
          if (pc.permaRiver) extra += '[永久跳河]';
          pieces.push(`${pc.n}(${getEffRk(pc)})@(${r},${c})${extra}`);
        }
      }
      lines.push(`${tag}棋子：${pieces.join('，') || '无'}`);
    }
    // barriers & traps
    const bKeys = Object.keys(barriers);
    if (bKeys.length) lines.push('障碍物：' + bKeys.map(k => `(${k})HP${barriers[k].hp}`).join('，'));
    const tKeys = Object.keys(placedTraps);
    if (tKeys.length) lines.push('玩家布置陷阱：' + tKeys.map(k => `(${k})属于${placedTraps[k] === 1 ? '红' : '蓝'}`).join('，'));
    if (counterattackState) lines.push(`反攻状态：${counterattackState.player === 1 ? '红' : '蓝'}方，剩余${counterattackState.turns}回合`);
    return lines.join('\n');
  },

  /* ---------- 可用技能 ---------- */
  serializeSkills(pl) {
    const list = [];
    for (const sk of SKILLS) {
      if (sk.passive) continue;
      const uses = skillUses[pl][sk.id];
      if (uses <= 0 && sk.id !== 'float') continue;
      if (sk.id === 'float') {
        if (skillConfig[pl]['float'] > 0) list.push(`float(浮空)：消耗1额外回合并获得3回合飞行（无视河流陷阱、可挤同格），无限次`);
        continue;
      }
      if (CHANCE_SKILLS.has(sk.id) && chanceUsedThisTurn) continue;
      list.push(`${sk.id}(${sk.n})：${sk.d}，剩余${uses}次`);
    }
    return list.length ? list.join('\n') : '（无可用主动技能）';
  },

  /* ---------- 合法移动 ---------- */
  serializeMoves(pl) {
    const mvs = getAllMoves(pl);
    if (!mvs.length) return '（无合法移动）';
    return mvs.slice(0, 60).map(([fr, fc, tr, tc, sc]) => {
      const from = board[fr][fc];
      const to = board[tr][tc];
      const desc = to ? `吃${to.n}` : (barriers[tr + ',' + tc] ? '打障碍' : '移动');
      return `(${fr},${fc})${from ? from.n : '?'}→(${tr},${tc})${desc}`;
    }).join('\n');
  },

  /* ---------- 构造 prompt ---------- */
  buildPrompt(aiPl) {
    const opp = aiPl === 1 ? 2 : 1;
    const myTag = aiPl === 1 ? '红方' : '蓝方';
    return [
      '你是一位斗兽棋大师，精通战术与技能配合。',
      '',
      '## 规则要点',
      '- 棋子等级：象8>狮7>虎6>豹5>狼4>狗3>猫2>鼠1。鼠可吃象，象不能吃鼠。',
      '- 狮/虎可直线跳过河流（河中有鼠则不能跳）；只有鼠可进入河流。',
      '- 鼠在河流中可吃相邻陆地敌方单位（无视等级）。',
      '- 踩入对方陷阱的棋子等级视为0，可被任意敌方棋子吃掉。',
      '- 任意棋子进入对方兽穴(D)即获胜。',
      '- 坐标格式：(行,列)，行0在顶部（蓝方），行8在底部（红方）。',
      '',
      '## 当前局面',
      this.serializeBoard(aiPl),
      '',
      `## 你是${myTag}（玩家${aiPl}），轮到你行动。`,
      '',
      '## 你可用的主动技能',
      this.serializeSkills(aiPl),
      '',
      '## 你的合法移动（前60种）',
      this.serializeMoves(aiPl),
      '',
      '## 行动要求',
      '分析局面，选择最优行动。可以直接移动棋子，也可以在合适时机使用技能建立优势。',
      '技能目标说明：mutate/golden/harden/thrust2/river2/suicide/laststand 目标=己方棋子坐标；dig目标=草地坐标；fill目标=河流坐标；hunter目标=己方半场空地坐标；swap目标=两枚己方棋子；thrust目标=棋子+两步终点；river目标=棋子+终点；rename目标=棋子+新类型(MOUSE/CAT/DOG/WOLF/LEOPARD/ELEPHANT)；float/firstchance/killchance无需目标。',
      '',
      '严格只返回一个JSON对象，不要任何其他文字、解释或代码块标记：',
      '移动：{"action":"move","from":[行,列],"to":[行,列],"reason":"简短理由"}',
      '技能：{"action":"skill","skill":"技能id","targets":[[行,列],...],"reason":"简短理由"}'
    ].join('\n');
  },

  /* ---------- 调用大模型 ---------- */
  async call(messages) {
    const url = this.config.baseUrl.replace(/\/+$/, '') + '/chat/completions';
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + this.config.apiKey
        },
        body: JSON.stringify({
          model: this.config.model,
          messages: messages,
          temperature: 0.3,
          max_tokens: 500
        }),
        signal: controller.signal
      });
      if (!resp.ok) throw new Error('HTTP ' + resp.status + ': ' + await resp.text());
      const data = await resp.json();
      return data.choices?.[0]?.message?.content || '';
    } finally {
      clearTimeout(timer);
    }
  },

  /* ---------- 解析 LLM 返回（三重容错） ---------- */
  parseDecision(text) {
    if (!text) return null;
    // 1) 直接 JSON.parse
    try { return JSON.parse(text.trim()); } catch (e) {}
    // 2) 提取 ```json ... ``` 代码块
    const m = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (m) { try { return JSON.parse(m[1].trim()); } catch (e) {} }
    // 3) 提取第一个 { ... }
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try { return JSON.parse(text.slice(start, end + 1)); } catch (e) {}
    }
    return null;
  },

  /* ---------- 主入口：获取 AI 决策 ---------- */
  async getDecision(aiPl) {
    if (!this.config.enabled || !this.config.apiKey) return null;
    this.thinking = true;
    try {
      const prompt = this.buildPrompt(aiPl);
      const content = await this.call([
        { role: 'system', content: '你是斗兽棋战术大师，只输出JSON。' },
        { role: 'user', content: prompt }
      ]);
      const decision = this.parseDecision(content);
      if (!decision) { console.warn('LLM 返回无法解析:', content); return null; }
      return decision;
    } catch (e) {
      console.error('LLM 调用失败:', e);
      return null;
    } finally {
      this.thinking = false;
    }
  }
};

LLM.load();
