#!/usr/bin/env node
// 看图工具：把图片发给视觉多模态模型，返回文字描述（供主模型阅读）
// 用法: node .claude/tools/vision.js <图片路径> ["自定义提示词"]
// 配置: .vision-env.json（本地文件，已被 .gitignore 忽略）或环境变量
const fs = require('fs');
const path = require('path');

function loadConfig() {
  const envPath = path.join(process.cwd(), '.vision-env.json');
  if (fs.existsSync(envPath)) {
    try {
      return JSON.parse(fs.readFileSync(envPath, 'utf8'));
    } catch (e) { /* 解析失败则回退环境变量 */ }
  }
  return {
    baseUrl: process.env.VISION_BASE_URL,
    model: process.env.VISION_MODEL,
    apiKey: process.env.VISION_API_KEY,
  };
}

const args = process.argv.slice(2);
// 用法: node .claude/tools/vision.js <图片路径> ["提示词"] [--brief|--detail] [--max-tokens N]
// 三档: 默认"平衡"（主体+文字+元素+布局，~800 token）；--brief 极简；--detail 详细
let imgPath = null, customPrompt = null, mode = 'normal', maxTokens = 800, tokenSet = false;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--detail') mode = 'detail';
  else if (args[i] === '--brief') mode = 'brief';
  else if (args[i] === '--max-tokens') { maxTokens = parseInt(args[i + 1], 10) || 800; tokenSet = true; i++; }
  else if (!imgPath) imgPath = args[i];
  else if (!customPrompt) customPrompt = args[i];
}
if (!imgPath) {
  console.error('用法: node .claude/tools/vision.js <图片路径> ["提示词"] [--brief|--detail] [--max-tokens N]');
  process.exit(1);
}
if (!tokenSet) {
  if (mode === 'brief') maxTokens = 400;
  else if (mode === 'detail') maxTokens = 1024;
}
const BRIEF_PROMPT = '这是图片。用最简要点回答：1)所有可见文字；2)关键元素；3)异常。不要修饰。';
const NORMAL_PROMPT = '这是一张图片（可能是游戏界面、插画或截图）。请简洁完整地描述：1)画面主体（什么角色/什么场景）；2)所有可见文字（逐字列出）；3)关键元素与布局；4)颜色/风格一句话；5)任何异常或渲染问题。控制在150字内，不用markdown标题，不推测背景故事。';
const DETAIL_PROMPT = '请详细描述这张图片：整体布局、主要元素、可见的文字、颜色，以及任何异常或需要留意的细节。';
const prompt = customPrompt || (mode === 'detail' ? DETAIL_PROMPT : mode === 'brief' ? BRIEF_PROMPT : NORMAL_PROMPT);

const cfg = loadConfig();
if (!cfg.apiKey) {
  console.error('缺少 API key：请在 .vision-env.json 里填 apiKey，或用环境变量 VISION_API_KEY');
  process.exit(1);
}

let img;
try {
  img = fs.readFileSync(imgPath);
} catch (e) {
  console.error('读图失败:', imgPath);
  process.exit(1);
}
const lower = imgPath.toLowerCase();
const mime = lower.endsWith('.png') ? 'image/png'
  : (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) ? 'image/jpeg'
  : lower.endsWith('.gif') ? 'image/gif' : 'image/webp';

const baseUrl = cfg.baseUrl || 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
const model = cfg.model || 'glm-4v-flash';

const body = {
  model,
  messages: [{
    role: 'user',
    content: [
      { type: 'image_url', image_url: { url: `data:${mime};base64,${img.toString('base64')}` } },
      { type: 'text', text: prompt },
    ],
  }],
  max_tokens: maxTokens,
};
// 思考型模型（如 kimi-k2.6）默认会吃掉全部 max_tokens，导致 content 为空。
// 配置 thinking:"disabled" 可关闭思考（识图任务不需要推理，快且省 token）。
if (cfg.thinking) body.thinking = { type: cfg.thinking };

async function callVision(attempts = 3) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const r = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${cfg.apiKey}` },
      body: JSON.stringify(body),
    });
    if (r.ok) return r.json();
    const t = await r.text();
    // 免费模型限 1 并发，429 限流时等待后重试
    if (r.status === 429 && attempt < attempts) {
      const wait = attempt * 3;
      console.error(`[限流429] 第${attempt}次失败，${wait}s后重试...`);
      await new Promise(res => setTimeout(res, wait * 1000));
      continue;
    }
    throw new Error(`HTTP ${r.status}: ${t.slice(0, 300)}`);
  }
}

callVision()
  .then(d => {
    const text = d.choices?.[0]?.message?.content;
    console.log(text !== undefined ? text : JSON.stringify(d));
  })
  .catch(e => { console.error('调用失败:', e.message); process.exit(1); });
