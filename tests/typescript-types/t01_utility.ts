type Nullable<T> = T | null;

type DeepReadonly<T> = {
  readonly [P in keyof T]: T[P] extends object ? DeepReadonly<T[P]> : T[P];
};

type PickByType<T, U> = {
  [K in keyof T as T[K] extends U ? K : never]: T[K];
};

type FirstArgument<F> = F extends (arg: infer A, ...args: any[]) => any ? A : never;

type Awaitable<T> = T | Promise<T>;

interface ApiResponse<T> {
  data: T;
  status: number;
  headers: Record<string, string>;
  error?: string;
}

type Method = "GET" | "POST" | "PUT" | "DELETE" | "PATCH";

interface Request<B = unknown> {
  method: Method;
  path: string;
  body?: B;
  params?: Record<string, string>;
}

type Handler<Req, Res> = (req: Request<Req>) => Promise<ApiResponse<Res>>;
