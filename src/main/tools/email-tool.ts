/**
 * 邮件发送工具（插件）
 * 
 * 支持通过 SMTP 发送邮件，兼容所有主流邮件服务商
 * 
 * 配置文件位置：
 * - 用户级别: ~/.deepbot/tools/email-tool/config.json
 * - 项目级别: <workspace>/.deepbot/tools/email-tool/config.json
 * 
 * 依赖安装：
 * - 首次使用时会自动检查并提示安装 nodemailer
 * - 手动安装：cd ~/.deepbot/tools/email-tool && pnpm install
 */

import { Type } from '@sinclair/typebox';
import type { ToolPlugin, ToolCreateOptions } from './registry/tool-interface';
import { readFileSync, existsSync } from 'node:fs';
import { basename, join } from 'node:path';
import { homedir } from 'node:os';
import { getErrorMessage } from '../../shared/utils/error-handler';
import { safeJsonParse } from '../../shared/utils/json-utils';
import { expandUserPath } from '../../shared/utils/path-utils';
import { TIMEOUTS } from '../config/timeouts';
import { TOOL_NAMES } from './tool-names';

// 动态导入类型（避免编译时依赖）
type Transporter = any;

/**
 * 邮件工具参数 Schema
 */
const EmailToolSchema = Type.Object({
  to: Type.String({
    description: '收件人邮箱地址（多个收件人用逗号分隔）',
  }),
  
  subject: Type.String({
    description: '邮件主题',
  }),
  
  body: Type.Optional(Type.String({
    description: '邮件正文内容（纯文本或 HTML）',
  })),
  
  bodyFile: Type.Optional(Type.String({
    description: '邮件正文文件路径（文本或 HTML 文件）',
  })),
  
  html: Type.Optional(Type.Boolean({
    description: '是否发送 HTML 邮件（默认 false）',
  })),
  
  attachments: Type.Optional(Type.Array(Type.String(), {
    description: '附件文件路径数组',
  })),
  
  cc: Type.Optional(Type.String({
    description: '抄送邮箱地址（多个用逗号分隔）',
  })),
  
  bcc: Type.Optional(Type.String({
    description: '密送邮箱地址（多个用逗号分隔）',
  })),
});

/**
 * 邮件配置接口
 */
interface EmailConfig {
  user: string;
  password: string;
  smtpServer: string;
  smtpPort: number;
  useSsl: boolean;
  fromName?: string;
}

/**
 * 从配置文件加载邮件配置
 */
function loadEmailConfig(workspaceDir: string): EmailConfig {
  // 配置文件查找顺序：项目级别 > 用户级别
  const configPaths = [
    join(workspaceDir, '.deepbot', 'tools', 'email-tool', 'config.json'),
    join(homedir(), '.deepbot', 'tools', 'email-tool', 'config.json'),
  ];
  
  for (const configPath of configPaths) {
    if (existsSync(configPath)) {
      try {
        const content = readFileSync(configPath, 'utf-8');
        const config = safeJsonParse<EmailConfig>(content, {} as EmailConfig);
        
        // 验证必填字段
        if (!config.user || !config.user.trim()) {
          throw new Error('配置错误: user 字段不能为空');
        }
        
        if (!config.password || !config.password.trim()) {
          throw new Error('配置错误: password 字段不能为空');
        }
        
        if (!config.smtpServer || !config.smtpServer.trim()) {
          throw new Error('配置错误: smtpServer 字段不能为空');
        }
        
        // 设置默认值
        config.smtpPort = config.smtpPort || 465;
        config.useSsl = config.useSsl !== false;
        
        console.log(`✅ [Email Tool] 加载配置: ${configPath}`);
        return config;
      } catch (error) {
        throw new Error(`加载邮件配置失败 (${configPath}): ${getErrorMessage(error)}`);
      }
    }
  }
  
  // 未找到配置文件
  throw new Error(
    '邮件工具未配置。请创建配置文件：\n' +
    `  用户级别: ${join(homedir(), '.deepbot', 'tools', 'email-tool', 'config.json')}\n` +
    `  项目级别: ${join(workspaceDir, '.deepbot', 'tools', 'email-tool', 'config.json')}\n\n` +
    '配置示例：\n' +
    '{\n' +
    '  "user": "your-email@example.com",\n' +
    '  "password": "your-password-or-auth-code",\n' +
    '  "smtpServer": "smtp.example.com",\n' +
    '  "smtpPort": 465,\n' +
    '  "useSsl": true,\n' +
    '  "fromName": "Your Name"\n' +
    '}'
  );
}

/**
 * 获取邮件工具目录
 */
function getEmailToolDir(): string {
  // 优先使用用户级别目录
  return join(homedir(), '.deepbot', 'tools', 'email-tool');
}

/**
 * 检查并加载 nodemailer
 */
async function loadNodemailer(): Promise<any> {
  const toolDir = getEmailToolDir();
  
  try {
    // 尝试从工具目录加载
    const nodemailerPath = join(toolDir, 'node_modules', 'nodemailer');
    if (existsSync(nodemailerPath)) {
      return require(nodemailerPath);
    }
    
    // 尝试从全局加载
    return require('nodemailer');
  } catch (error) {
    // nodemailer 未安装
    throw new Error(
      '❌ nodemailer 未安装\n\n' +
      '请运行以下命令安装依赖：\n\n' +
      `  mkdir -p ${toolDir}\n` +
      `  cd ${toolDir}\n` +
      `  pnpm init -y\n` +
      `  pnpm add nodemailer\n\n` +
      '或者使用 npm：\n\n' +
      `  npm install nodemailer --prefix ${toolDir}\n\n` +
      '安装完成后重试。'
    );
  }
}

/**
 * 创建 SMTP 传输器
 */
function createTransporter(nodemailer: any, config: EmailConfig): Transporter {
  return nodemailer.createTransport({
    host: config.smtpServer,
    port: config.smtpPort,
    secure: config.useSsl, // true for 465, false for other ports
    auth: {
      user: config.user,
      pass: config.password,
    },
    // 超时设置
    connectionTimeout: TIMEOUTS.HTTP_REQUEST_TIMEOUT,
    greetingTimeout: TIMEOUTS.HTTP_REQUEST_TIMEOUT,
    socketTimeout: TIMEOUTS.HTTP_REQUEST_TIMEOUT,
  });
}

/**
 * 邮件工具插件
 */
export const emailToolPlugin: ToolPlugin = {
  metadata: {
    id: 'email-tool',
    name: TOOL_NAMES.SEND_EMAIL,
    version: '1.0.0',
    description: '通过 SMTP 发送邮件。支持纯文本/HTML 邮件、附件、抄送、密送。兼容所有主流邮件服务商（QQ、Gmail、Outlook、163 等）',
    author: 'DeepBot',
    category: 'network',
    tags: ['email', 'smtp', 'communication'],
    requiresConfig: true,
  },
  
  create: (options: ToolCreateOptions) => {
    const { workspaceDir } = options;
    return [
      {
        name: TOOL_NAMES.SEND_EMAIL,
        label: '发送邮件',
        description: '通过 SMTP 发送邮件。支持纯文本/HTML 邮件、附件、抄送、密送。兼容所有主流邮件服务商（QQ、Gmail、Outlook、163 等）',
        parameters: EmailToolSchema,
        
        execute: async (_toolCallId: string, args: any, signal?: AbortSignal) => {
          try {
            const params = args as {
              to: string;
              subject: string;
              body?: string;
              bodyFile?: string;
              html?: boolean;
              attachments?: string[];
              cc?: string;
              bcc?: string;
            };
            
            console.log('[Email Tool] 📧 发送邮件');
            console.log('  收件人:', params.to);
            console.log('  主题:', params.subject);
            
            // 检查是否被取消
            if (signal?.aborted) {
              const err = new Error('邮件发送操作被取消');
              err.name = 'AbortError';
              throw err;
            }
            
            // 验证参数
            if (!params.body && !params.bodyFile) {
              throw new Error('缺少参数: body 或 bodyFile 必须提供其中之一');
            }
            
            if (params.body && params.bodyFile) {
              throw new Error('参数冲突: body 和 bodyFile 不能同时提供');
            }
            
            // 加载 nodemailer
            let nodemailer: any;
            try {
              nodemailer = await loadNodemailer();
            } catch (error) {
              return {
                content: [
                  {
                    type: 'text',
                    text: getErrorMessage(error),
                  },
                ],
                details: {
                  success: false,
                  error: 'nodemailer_not_installed',
                },
                isError: true,
              };
            }
            
            // 加载配置
            const config = loadEmailConfig(workspaceDir);
            
            // 读取邮件正文
            let bodyContent: string;
            if (params.body) {
              bodyContent = params.body;
            } else if (params.bodyFile) {
              // 展开路径（支持 ~ 符号）
              const expandedBodyFile = expandUserPath(params.bodyFile);
              
              if (!existsSync(expandedBodyFile)) {
                throw new Error(`邮件正文文件不存在: ${params.bodyFile}`);
              }
              
              try {
                bodyContent = readFileSync(expandedBodyFile, 'utf-8');
              } catch (error) {
                throw new Error(`读取邮件正文文件失败: ${getErrorMessage(error)}`);
              }
            } else {
              throw new Error('未提供邮件正文');
            }
            
            // 处理换行符（支持 CLI 传入的转义字符）
            bodyContent = bodyContent
              .replace(/\\n/g, '\n')
              .replace(/\\r/g, '\r')
              .replace(/\\t/g, '\t');
            
            // 检查是否被取消
            if (signal?.aborted) {
              const err = new Error('邮件发送操作被取消');
              err.name = 'AbortError';
              throw err;
            }
            
            // 创建传输器
            const transporter = createTransporter(nodemailer, config);
            
            // 构建邮件选项
            const mailOptions: any = {
              from: config.fromName 
                ? `"${config.fromName}" <${config.user}>`
                : config.user,
              to: params.to,
              subject: params.subject,
            };
            
            // 设置邮件正文
            if (params.html) {
              mailOptions.html = bodyContent;
            } else {
              mailOptions.text = bodyContent;
            }
            
            // 添加抄送
            if (params.cc) {
              mailOptions.cc = params.cc;
            }
            
            // 添加密送
            if (params.bcc) {
              mailOptions.bcc = params.bcc;
            }
            
            // 添加附件
            if (params.attachments && params.attachments.length > 0) {
              mailOptions.attachments = [];
              
              for (const filePath of params.attachments) {
                // 展开路径（支持 ~ 符号）
                const expandedFilePath = expandUserPath(filePath);
                
                if (!existsSync(expandedFilePath)) {
                  console.warn(`⚠️ 附件文件不存在，跳过: ${filePath}`);
                  continue;
                }
                
                mailOptions.attachments.push({
                  filename: basename(expandedFilePath),
                  path: expandedFilePath,
                });
              }
              
              console.log(`  附件数量: ${mailOptions.attachments.length}`);
            }
            
            // 监听 abort 事件
            const abortHandler = () => {
              console.log('⏹️ [Email Tool] 检测到取消信号，中止邮件发送');
              // nodemailer 没有直接的 abort 方法，但可以关闭连接
              transporter.close();
            };
            
            if (signal) {
              signal.addEventListener('abort', abortHandler, { once: true });
            }
            
            try {
              // 发送邮件
              console.log('📤 正在发送邮件...');
              const info = await transporter.sendMail(mailOptions);
              
              // 检查是否被取消
              if (signal?.aborted) {
                const err = new Error('邮件发送操作被取消');
                err.name = 'AbortError';
                throw err;
              }
              
              console.log('✅ 邮件发送成功');
              console.log('  Message ID:', info.messageId);
              
              // 构建结果消息
              let resultMessage = `✅ 邮件发送成功！\n\n`;
              resultMessage += `收件人: ${params.to}\n`;
              resultMessage += `主题: ${params.subject}\n`;
              
              if (params.cc) {
                resultMessage += `抄送: ${params.cc}\n`;
              }
              
              if (params.bcc) {
                resultMessage += `密送: ${params.bcc}\n`;
              }
              
              if (mailOptions.attachments && mailOptions.attachments.length > 0) {
                resultMessage += `附件: ${mailOptions.attachments.length} 个文件\n`;
              }
              
              resultMessage += `\nMessage ID: ${info.messageId}`;
              
              return {
                content: [
                  {
                    type: 'text',
                    text: resultMessage,
                  },
                ],
                details: {
                  success: true,
                  messageId: info.messageId,
                  to: params.to,
                  subject: params.subject,
                },
              };
            } finally {
              // 清理
              if (signal) {
                signal.removeEventListener('abort', abortHandler);
              }
              transporter.close();
            }
          } catch (error) {
            console.error('[Email Tool] ❌ 发送失败:', error);
            
            // 构建错误消息
            let errorMessage = `❌ 邮件发送失败: ${getErrorMessage(error)}\n\n`;
            
            // 添加常见问题提示
            const errorStr = getErrorMessage(error).toLowerCase();
            
            if (errorStr.includes('authentication') || errorStr.includes('auth')) {
              errorMessage += `💡 认证失败，请检查：\n`;
              errorMessage += `   • SMTP 服务是否已在邮箱设置中启用\n`;
              errorMessage += `   • 密码是否为授权码（而非邮箱登录密码）\n`;
              errorMessage += `   • 授权码是否正确且未过期\n`;
            } else if (errorStr.includes('timeout') || errorStr.includes('timed out')) {
              errorMessage += `💡 连接超时，请检查：\n`;
              errorMessage += `   • 网络连接是否正常\n`;
              errorMessage += `   • SMTP 服务器地址和端口是否正确\n`;
              errorMessage += `   • 防火墙是否阻止了连接\n`;
            } else if (errorStr.includes('econnrefused')) {
              errorMessage += `💡 连接被拒绝，请检查：\n`;
              errorMessage += `   • SMTP 服务器地址是否正确\n`;
              errorMessage += `   • SMTP 端口是否正确（通常为 465 或 587）\n`;
            }
            
            return {
              content: [
                {
                  type: 'text',
                  text: errorMessage,
                },
              ],
              details: {
                success: false,
                error: getErrorMessage(error),
              },
              isError: true,
            };
          }
        },
      },
    ];
  },
};
