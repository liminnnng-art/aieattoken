export {};
export declare function timeExecution<T>(fn: () => T, iterations?: number): {
    result: T;
    avgMs: number;
    runs: number[];
};
