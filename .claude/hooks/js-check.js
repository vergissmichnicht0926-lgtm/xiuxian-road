// Claude Code hook: 改完 .js 文件自动跑 node --check 语法检查
// 只在 file_path 以 .js 结尾时执行，其余文件直接放行
let input = '';
process.stdin.on('data', d => (input += d));
process.stdin.on('end', () => {
  try {
    const data = JSON.parse(input);
    const fp = data.file_path || '';
    if (!/\.js$/.test(fp)) process.exit(0);

    const { execFileSync } = require('child_process');
    try {
      execFileSync('node', ['--check', fp], { stdio: 'pipe' });
    } catch (e) {
      const err = (e.stderr || e.message || '').toString();
      console.error(`JS 语法错误 → ${fp}`);
      console.error(err.split('\n').slice(0, 6).join('\n'));
      process.exit(2);
    }
  } catch (e) {
    // 解析失败就当没这回事，不打断工作流
    process.exit(0);
  }
});
