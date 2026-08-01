// ======================== AI 调用封装 ========================

async function aiCall(systemPrompt, userPrompt, timeout=30000, forceJson=true, retries=2) {
  if (!aiConfig.url || !aiConfig.key) throw new Error('请先配置AI接口');
  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);
    try {
      const body = {
        model: aiConfig.model,
        messages:[ {role:'system',content:systemPrompt}, {role:'user',content:userPrompt} ],
        temperature:0.85, max_tokens:4096,
      };
      if (forceJson) body.response_format = { type: 'json_object' };
      const res = await fetch(aiConfig.url, {
        method:'POST',
        headers:{ 'Content-Type':'application/json', 'Authorization':`Bearer ${aiConfig.key}` },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`HTTP ${res.status}: ${errText.slice(0,200)}`);
      }
      const data = await res.json();
      let text = data.choices?.[0]?.message?.content || '';
      if (forceJson) text = extractJson(text);
      return { text, raw:data };
    } catch(e) {
      lastError = e;
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, (attempt+1)*1000));
        continue;
      }
    } finally { clearTimeout(timer); }
  }
  throw lastError;
}

function extractJson(text) {
  let cleaned = text.replace(/```json\s*/gi,'').replace(/```\s*/g,'').trim();
  const m = cleaned.match(/\{[\s\S]*\}/);
  if (m) return m[0];
  const m2 = text.match(/\{[\s\S]*\}/);
  if (m2) return m2[0];
  return text;
}

function safeJsonParse(text, fallback=null) {
  const attempts = [
    text,
    text.replace(/```json\s*/gi,'').replace(/```\s*/g,''),
    text.replace(/```[\s\S]*?```/g, (block) => block.replace(/```json\s*/gi,'').replace(/```\s*/g,'')),
  ];
  for (const t of attempts) {
    try {
      const trimmed = t.trim();
      if (trimmed.startsWith('{')) return JSON.parse(trimmed);
    } catch(e) {}
  }
  try {
    const extracted = extractJson(text);
    if (extracted && extracted.startsWith('{')) return JSON.parse(extracted);
  } catch(e) {}
  return fallback;
}

function esc(s) {
  if (!s) return '';
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
