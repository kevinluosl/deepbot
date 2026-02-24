/**
 * 清理定时任务数据库
 * 
 * 用途：删除所有定时任务，重置数据库
 * 
 * 使用方法：
 * node clear-scheduled-tasks.js
 */

const Database = require('better-sqlite3');
const path = require('path');
const os = require('os');

// 数据库路径
const dbPath = path.join(os.homedir(), '.deepbot', 'scheduled-tasks.db');

console.log('📂 数据库路径:', dbPath);

try {
  // 打开数据库
  const db = new Database(dbPath);
  
  // 查询当前任务数量
  const countResult = db.prepare('SELECT COUNT(*) as count FROM tasks').get();
  const taskCount = countResult.count;
  
  console.log(`📊 当前任务数量: ${taskCount}`);
  
  if (taskCount === 0) {
    console.log('✅ 数据库已经是空的，无需清理');
    db.close();
    process.exit(0);
  }
  
  // 列出所有任务
  console.log('\n📋 当前任务列表:');
  const tasks = db.prepare('SELECT id, name, enabled FROM tasks').all();
  tasks.forEach((task, index) => {
    console.log(`  ${index + 1}. ${task.name} (${task.id}) - ${task.enabled ? '已启用' : '已禁用'}`);
  });
  
  // 删除所有任务
  console.log('\n🗑️  开始清理...');
  db.prepare('DELETE FROM tasks').run();
  db.prepare('DELETE FROM executions').run();
  
  console.log('✅ 清理完成！');
  console.log(`   删除了 ${taskCount} 个任务`);
  
  // 关闭数据库
  db.close();
  
  console.log('\n💡 提示：重启 DeepBot 后生效');
  
} catch (error) {
  console.error('❌ 清理失败:', error.message);
  process.exit(1);
}
