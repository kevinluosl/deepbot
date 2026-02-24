/**
 * DeepBot 类型定义
 */
export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'timeout';
export interface MainTask {
    id: string;
    name: string;
    status: TaskStatus;
    startTime: Date;
    estimatedEndTime?: Date;
    subTasks: SubTask[];
}
export interface SubTask {
    id: string;
    description: string;
    status: TaskStatus;
    currentStep?: string;
    progress?: number;
    startTime: Date;
    endTime?: Date;
    error?: string;
}
export interface Message {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: Date;
}
export interface Config {
    qwen: {
        apiKey: string;
        model: string;
        baseURL: string;
    };
}
//# sourceMappingURL=index.d.ts.map