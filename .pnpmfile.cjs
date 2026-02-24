// pnpm 钩子文件 - 允许所有包运行构建脚本

function readPackage(pkg) {
  // 允许所有包运行构建脚本
  return pkg;
}

module.exports = {
  hooks: {
    readPackage,
  },
};
