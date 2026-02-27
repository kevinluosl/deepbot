/**
 * 飞书文档处理器
 * 
 * 负责检测和读取飞书文档内容
 */

import * as Lark from '@larksuiteoapi/node-sdk';
import { getErrorMessage } from '../../../shared/utils/error-handler';

/**
 * 文档信息
 */
export interface DocumentInfo {
  documentId: string;
  title: string;
  content: string;
  url: string;
}

/**
 * 飞书文档处理器
 */
export class FeishuDocumentHandler {
  private client: Lark.Client;
  
  constructor(client: Lark.Client) {
    this.client = client;
  }
  
  /**
   * 从消息中提取文档链接
   * 
   * 支持的格式：
   * - https://xxx.feishu.cn/docx/xxxxx
   * - https://xxx.feishu.cn/docs/xxxxx
   * - https://xxx.feishu.cn/wiki/xxxxx
   * - https://xxx.feishu.cn/sheets/xxxxx
   * - Markdown 格式：[标题](https://xxx.feishu.cn/sheets/xxxxx)
   */
  extractDocumentUrls(text: string): string[] {
    // 匹配 URL，排除 Markdown 的结束括号
    const urlPattern = /https:\/\/[^\/\s]+\.feishu\.cn\/(docx|docs|wiki|sheets)\/[^\s\)]+/g;
    const matches = text.match(urlPattern);
    return matches || [];
  }
  
  /**
   * 从 URL 中提取文档 ID 和类型
   */
  private extractDocumentInfo(url: string): { id: string; type: string } | null {
    // 匹配 /docx/xxxxx 或 /docs/xxxxx 等格式
    // 排除 URL 末尾可能的特殊字符（如 Markdown 的括号、问号、井号等）
    const match = url.match(/\/(docx|docs|wiki|sheets)\/([a-zA-Z0-9_-]+)/);
    if (!match) {
      return null;
    }
    return {
      type: match[1],
      id: match[2],
    };
  }
  
  /**
   * 读取文档内容
   */
  async readDocument(url: string): Promise<DocumentInfo | null> {
    console.log('[FeishuDocumentHandler] 📖 开始读取文档:', url);
    
    try {
      // 1. 提取文档 ID 和类型
      const docInfo = this.extractDocumentInfo(url);
      if (!docInfo) {
        console.error('[FeishuDocumentHandler] ❌ 无法提取文档信息:', url);
        return null;
      }
      
      console.log('[FeishuDocumentHandler] 文档信息:', docInfo);
      
      // 2. 根据类型调用不同的 API
      if (docInfo.type === 'sheets') {
        return await this.readSpreadsheet(docInfo.id, url);
      } else {
        return await this.readDocxDocument(docInfo.id, url);
      }
    } catch (error) {
      console.error('[FeishuDocumentHandler] ❌ 读取文档异常:', {
        url,
        error: getErrorMessage(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      return null;
    }
  }
  
  /**
   * 读取飞书文档（docx/docs/wiki）
   */
  private async readDocxDocument(documentId: string, url: string): Promise<DocumentInfo | null> {
    console.log('[FeishuDocumentHandler] 📄 读取飞书文档...');
    
    // 获取文档元信息
    console.log('[FeishuDocumentHandler] 🔄 正在获取文档元信息...');
    const metaRes = await this.client.docx.document.get({
      path: {
        document_id: documentId,
      },
    });
    
    console.log('[FeishuDocumentHandler] 元信息响应:', {
      code: metaRes?.code,
      msg: metaRes?.msg,
      hasData: !!metaRes?.data,
    });
    
    if (!metaRes || metaRes.code !== 0) {
      console.error('[FeishuDocumentHandler] ❌ 获取文档元信息失败:', {
        code: metaRes?.code,
        msg: metaRes?.msg,
        url,
      });
      
      if (metaRes?.code === 99991663) {
        console.error('[FeishuDocumentHandler] 💡 权限不足，请在飞书开放平台添加以下权限:');
        console.error('[FeishuDocumentHandler]    - docx:document:readonly');
        console.error('[FeishuDocumentHandler]    - drive:drive:readonly');
      }
      
      return null;
    }
    
    const title = metaRes.data?.document?.title || '未命名文档';
    console.log('[FeishuDocumentHandler] ✅ 文档标题:', title);
    
    // 获取文档原始内容
    console.log('[FeishuDocumentHandler] 🔄 正在获取文档内容...');
    const contentRes = await this.client.docx.document.rawContent({
      path: {
        document_id: documentId,
      },
    });
    
    console.log('[FeishuDocumentHandler] 内容响应:', {
      code: contentRes?.code,
      msg: contentRes?.msg,
      hasData: !!contentRes?.data,
    });
    
    if (!contentRes || contentRes.code !== 0) {
      console.error('[FeishuDocumentHandler] ❌ 获取文档内容失败:', {
        code: contentRes?.code,
        msg: contentRes?.msg,
        url,
      });
      return null;
    }
    
    const content = contentRes.data?.content || '';
    console.log('[FeishuDocumentHandler] ✅ 文档内容长度:', content.length);
    
    return {
      documentId,
      title,
      content,
      url,
    };
  }
  
  /**
   * 读取飞书电子表格（sheets）
   */
  private async readSpreadsheet(spreadsheetToken: string, url: string): Promise<DocumentInfo | null> {
    console.log('[FeishuDocumentHandler] 📊 读取飞书电子表格...');
    
    try {
      // 1. 获取电子表格元信息
      console.log('[FeishuDocumentHandler] 🔄 正在获取电子表格元信息...');
      const metaRes = await this.client.sheets.spreadsheet.get({
        path: {
          spreadsheet_token: spreadsheetToken,
        },
      });
      
      console.log('[FeishuDocumentHandler] 电子表格元信息响应:', {
        code: metaRes?.code,
        msg: metaRes?.msg,
        hasData: !!metaRes?.data,
      });
      
      if (!metaRes || metaRes.code !== 0) {
        console.error('[FeishuDocumentHandler] ❌ 获取电子表格元信息失败:', {
          code: metaRes?.code,
          msg: metaRes?.msg,
          url,
        });
        
        if (metaRes?.code === 99991663 || metaRes?.code === 1254044) {
          console.error('[FeishuDocumentHandler] 💡 权限不足，请在飞书开放平台添加以下权限:');
          console.error('[FeishuDocumentHandler]    - sheets:spreadsheet:readonly (或 sheets:spreadsheet)');
          console.error('[FeishuDocumentHandler]    - drive:drive:readonly (或 drive:drive)');
        }
        
        return null;
      }
      
      const title = metaRes.data?.spreadsheet?.title || '未命名电子表格';
      console.log('[FeishuDocumentHandler] ✅ 电子表格标题:', title);
      
      // 2. 获取工作表列表（使用专门的 API）
      console.log('[FeishuDocumentHandler] 🔄 正在获取工作表列表...');
      const sheetsRes = await (this.client.sheets as any).spreadsheetSheet.query({
        path: {
          spreadsheet_token: spreadsheetToken,
        },
      });
      
      console.log('[FeishuDocumentHandler] 工作表列表响应:', {
        code: sheetsRes?.code,
        msg: sheetsRes?.msg,
        hasData: !!sheetsRes?.data,
      });
      
      if (!sheetsRes || sheetsRes.code !== 0) {
        console.error('[FeishuDocumentHandler] ❌ 获取工作表列表失败:', {
          code: sheetsRes?.code,
          msg: sheetsRes?.msg,
        });
        return null;
      }
      
      const sheets = (sheetsRes.data as any)?.sheets || [];
      console.log('[FeishuDocumentHandler] 📑 工作表数量:', sheets.length);
      
      if (sheets.length === 0) {
        console.warn('[FeishuDocumentHandler] ⚠️ 电子表格中没有工作表');
        return {
          documentId: spreadsheetToken,
          title,
          content: '(电子表格为空，没有工作表)',
          url,
        };
      }
      
      // 3. 读取所有工作表的数据
      const sheetContents: string[] = [];
      
      for (const sheet of sheets) {
        const sheetId = sheet.sheet_id;
        const sheetTitle = sheet.title || '未命名工作表';
        
        console.log('[FeishuDocumentHandler] 🔄 读取工作表:', sheetTitle);
        
        try {
          // 获取工作表的值（读取整个工作表）
          // 使用 sheets API 的 batchGet 方法
          const valuesRes = await this.client.request({
            method: 'GET',
            url: `/open-apis/sheets/v2/spreadsheets/${spreadsheetToken}/values/${sheetId}`,
          });
          
          if (valuesRes && valuesRes.code === 0 && (valuesRes.data as any)?.valueRange) {
            const values = (valuesRes.data as any).valueRange.values || [];
            console.log('[FeishuDocumentHandler] ✅ 工作表数据行数:', values.length);
            
            // 格式化工作表数据
            const formattedSheet = this.formatSheetData(sheetTitle, values);
            sheetContents.push(formattedSheet);
          } else {
            console.warn('[FeishuDocumentHandler] ⚠️ 工作表数据为空或读取失败:', sheetTitle, {
              code: valuesRes?.code,
              msg: valuesRes?.msg,
            });
          }
        } catch (error) {
          console.error('[FeishuDocumentHandler] ❌ 读取工作表失败:', sheetTitle, getErrorMessage(error));
        }
      }
      
      const content = sheetContents.join('\n\n');
      console.log('[FeishuDocumentHandler] ✅ 电子表格总内容长度:', content.length);
      
      return {
        documentId: spreadsheetToken,
        title,
        content,
        url,
      };
    } catch (error) {
      console.error('[FeishuDocumentHandler] ❌ 读取电子表格异常:', {
        spreadsheetToken,
        error: getErrorMessage(error),
      });
      return null;
    }
  }
  
  /**
   * 格式化工作表数据为文本
   */
  private formatSheetData(sheetTitle: string, values: any[][]): string {
    const lines: string[] = [];
    lines.push(`## ${sheetTitle}`);
    lines.push('');
    
    if (values.length === 0) {
      lines.push('(空工作表)');
      return lines.join('\n');
    }
    
    // 将二维数组转换为表格文本
    for (let i = 0; i < values.length; i++) {
      const row = values[i];
      const rowText = row.map((cell: any) => {
        if (cell === null || cell === undefined) {
          return '';
        }
        return String(cell);
      }).join(' | ');
      
      lines.push(rowText);
      
      // 第一行后添加分隔线（如果是表头）
      if (i === 0 && values.length > 1) {
        const separator = row.map(() => '---').join(' | ');
        lines.push(separator);
      }
    }
    
    return lines.join('\n');
  }
  
  /**
   * 批量读取文档
   */
  async readDocuments(urls: string[]): Promise<DocumentInfo[]> {
    const results: DocumentInfo[] = [];
    
    for (const url of urls) {
      const doc = await this.readDocument(url);
      if (doc) {
        results.push(doc);
      }
    }
    
    return results;
  }
  
  /**
   * 格式化文档内容为消息附加内容
   */
  formatDocumentContent(docs: DocumentInfo[]): string {
    if (docs.length === 0) {
      return '';
    }
    
    const parts: string[] = [];
    
    parts.push('\n\n--- 飞书文档内容 ---\n');
    
    for (const doc of docs) {
      parts.push(`\n【${doc.title}】`);
      parts.push(`链接: ${doc.url}`);
      parts.push(`\n内容:\n${doc.content}\n`);
      parts.push('---\n');
    }
    
    return parts.join('\n');
  }
}
