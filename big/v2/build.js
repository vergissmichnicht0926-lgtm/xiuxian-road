// ======================== 修仙之路 v2 构建脚本 ========================
// 将模块化的 CSS/JS 全部内联到单个 HTML，方便手机直接打开
// 用法：node build.js

const fs = require('fs');
const path = require('path');

const BASE = __dirname;

// 1. 读取 HTML 模板
let html = fs.readFileSync(path.join(BASE, 'index.html'), 'utf-8');

// 2. 内联 CSS
const cssMatch = html.match(/<link[^>]*href="([^"]*\.css)"[^>]*>/i);
if (cssMatch) {
  const cssPath = path.join(BASE, cssMatch[1]);
  const css = fs.readFileSync(cssPath, 'utf-8');
  html = html.replace(cssMatch[0], `<style>\n${css}\n</style>`);
  console.log(`✅ 内联 CSS: ${cssMatch[1]} (${css.length} 字符)`);
}

// 3. 内联 JS（按顺序替换 script src="..."）
const scriptRegex = /<script\s+src="([^"]+)"\s*><\/script>/gi;
let match;
let jsCount = 0;
while ((match = scriptRegex.exec(html)) !== null) {
  const jsPath = path.join(BASE, match[1]);
  if (fs.existsSync(jsPath)) {
    const js = fs.readFileSync(jsPath, 'utf-8');
    html = html.replace(match[0], `<script>\n${js}\n</script>`);
    jsCount++;
    console.log(`✅ 内联 JS: ${match[1]} (${js.length} 字符)`);
  } else {
    console.warn(`⚠️  找不到: ${jsPath}`);
  }
}

// 4. 清理多余空行（可选）
html = html.replace(/\n{3,}/g, '\n\n');

// 5. 输出到 big/index.html
const outPath = path.join(BASE, '..', 'index.html');
fs.writeFileSync(outPath, html, 'utf-8');
console.log(`✅ 构建: ${outPath} (${html.length} 字符)`);

// 6. 同步到仓库根目录（GitHub Pages 需要根目录的 index.html）
const rootPath = path.join(BASE, '..', '..', 'index.html');
fs.writeFileSync(rootPath, html, 'utf-8');
console.log(`✅ GitHub Pages: ${rootPath}`);
console.log(`\n🎉 构建完成 (${html.length} 字符)`);
