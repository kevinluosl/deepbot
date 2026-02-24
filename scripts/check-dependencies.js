/**
 * 检查所有依赖的子依赖
 * 用于确保打包时不会遗漏依赖
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('📦 检查项目依赖...\n');

// 读取 package.json
const packageJson = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../package.json'), 'utf-8')
);

const dependencies = packageJson.dependencies || {};

console.log('主要依赖:');
Object.keys(dependencies).forEach(dep => {
  console.log(`  - ${dep}@${dependencies[dep]}`);
});

console.log('\n🔍 检查子依赖...\n');

// 检查每个依赖的子依赖
const problematicDeps = [];

Object.keys(dependencies).forEach(dep => {
  try {
    const depPackageJsonPath = path.join(
      __dirname,
      '../node_modules',
      dep,
      'package.json'
    );
    
    if (fs.existsSync(depPackageJsonPath)) {
      const depPackageJson = JSON.parse(
        fs.readFileSync(depPackageJsonPath, 'utf-8')
      );
      
      const subDeps = depPackageJson.dependencies || {};
      
      if (Object.keys(subDeps).length > 0) {
        console.log(`${dep}:`);
        Object.keys(subDeps).forEach(subDep => {
          console.log(`  └─ ${subDep}@${subDeps[subDep]}`);
          
          // 检查子依赖是否存在
          const subDepPath = path.join(
            __dirname,
            '../node_modules',
            subDep
          );
          
          if (!fs.existsSync(subDepPath)) {
            problematicDeps.push({
              parent: dep,
              missing: subDep,
              version: subDeps[subDep]
            });
          }
        });
        console.log('');
      }
    }
  } catch (error) {
    console.error(`  ❌ 检查 ${dep} 失败:`, error.message);
  }
});

if (problematicDeps.length > 0) {
  console.log('\n⚠️  发现缺失的子依赖:\n');
  problematicDeps.forEach(({ parent, missing, version }) => {
    console.log(`  ${parent} 需要 ${missing}@${version}`);
  });
  console.log('\n建议运行: pnpm install');
} else {
  console.log('✅ 所有依赖检查通过！');
}

// 特别检查容易出问题的依赖
console.log('\n🔧 特别检查:\n');

const criticalDeps = [
  'cron',
  'luxon',
  'express',
  'body-parser',
  '@sinclair/typebox',
  'better-sqlite3',
  'playwright-core'
];

criticalDeps.forEach(dep => {
  const depPath = path.join(__dirname, '../node_modules', dep);
  if (fs.existsSync(depPath)) {
    console.log(`  ✅ ${dep}`);
  } else {
    console.log(`  ❌ ${dep} (缺失)`);
  }
});

console.log('\n完成！');
