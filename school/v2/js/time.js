// ======================== 时间系统 ========================

// 日式学期定义
const SEMESTERS = {
  // year 1
  '1,1': { name: '一学期', months: '4月～7月', season: '🌸 春', seasonIcon: '🌸' },
  '1,2': { name: '二学期', months: '9月～12月', season: '🍂 秋', seasonIcon: '🍂' },
  '1,3': { name: '三学期', months: '1月～3月', season: '❄️ 冬', seasonIcon: '❄️' },
  // year 2
  '2,1': { name: '一学期', months: '4月～7月', season: '🌸 春', seasonIcon: '🌸' },
  '2,2': { name: '二学期', months: '9月～12月', season: '🍂 秋', seasonIcon: '🍂' },
  '2,3': { name: '三学期', months: '1月～3月', season: '❄️ 冬', seasonIcon: '❄️' },
  // year 3
  '3,1': { name: '一学期', months: '4月～7月', season: '🌸 春', seasonIcon: '🌸' },
  '3,2': { name: '二学期', months: '9月～12月', season: '🍂 秋', seasonIcon: '🍂' },
  '3,3': { name: '三学期', months: '1月～3月', season: '❄️ 冬', seasonIcon: '❄️' },
};

// 学期内关键节点
const KEY_NODES = {
  // 学期内按周数的大节点 (相对于每学期的周，20周制)
  '1,1': { 1: '入学式', 11: '中间考', 19: '期末考' },
  '1,2': { 1: '夏休み明け', 5: '文化祭', 11: '修学旅行', 19: '期末考' },
  '1,3': { 5: '情人节', 16: '期末考' },
  '2,1': { 1: '开学', 7: '体育祭', 11: '中间考', 19: '期末考' },
  '2,2': { 5: '文化祭', 11: '修学旅行', 19: '期末考' },
  '2,3': { 1: '冬休み·初詣', 5: '情人节', 16: '期末考' },
  '3,1': { 1: '开学+进路相谈', 11: '中间考', 19: '期末考' },
  '3,2': { 5: '文化祭', 7: '体育祭·最終', 11: '受験准备', 19: '期末考' },
  '3,3': { 5: '情人节', 11: '卒業式' },
};

// 每个学期的周数
const WEEKS_PER_SEMESTER = 20;

function getSemesterKey() {
  return `${G.year},${G.semester}`;
}

function getSemesterInfo() {
  const key = getSemesterKey();
  return SEMESTERS[key] || { name: '?', months: '?', season: '?', seasonIcon: '❓' };
}

function getCurrentNodeName() {
  const key = getSemesterKey();
  const nodes = KEY_NODES[key] || {};
  return nodes[G.week] || null;
}

function getSeasonIcon() {
  return getSemesterInfo().seasonIcon;
}

function getYearLabel() {
  const labels = { 1: '一年級', 2: '二年級', 3: '三年級' };
  return labels[G.year] || '?';
}

function getDateString() {
  const sem = getSemesterInfo();
  return `${getYearLabel()}·${sem.name}`;
}

function advanceWeek() {
  G.week++;
  // 冷却递减
  if (G.inviteCooldown > 0) G.inviteCooldown--;

  if (G.week > WEEKS_PER_SEMESTER) {
    G.week = 1;
    G.semester++;
    if (G.semester > 3) {
      G.semester = 1;
      G.year++;
    }
  }

  // 学年结束后（升级）
  if (G.semester === 1 && G.week === 1 && G.year > 1) {
    // 每年开始可以发生换班等事件
  }

  // 高三3学期第11周 = 毕业
  if (G.year === 3 && G.semester === 3 && G.week >= 11) {
    return 'graduate';
  }

  // 检查是否是大节点
  const node = getCurrentNodeName();
  if (node) return node;
  return null;
}

function getEventTier() {
  // 返回当前周的事件层级: 'normal' | 'minor' | 'major'
  const node = getCurrentNodeName();
  if (node) return 'major';

  // 随机小事件概率 ~20%
  if (Math.random() < 0.2) return 'minor';

  return 'normal';
}
