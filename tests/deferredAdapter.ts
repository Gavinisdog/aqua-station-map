import {
  AxiosError,
  CanceledError,
  type AxiosAdapter,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from "axios";

export type DeferredCall = {
  config: InternalAxiosRequestConfig;
  respond: (data: unknown) => void;
  fail: (status: number) => void;
  // 本專案新增：以任意錯誤 reject（模擬 timeout / 網路錯誤）
  reject: (error: unknown) => void;
};

// 回應順序由測試手動控制，才能重現「先送的晚回」
export const createDeferredAdapter = () => {
  const calls: DeferredCall[] = [];

  const adapter: AxiosAdapter = (config) =>
    new Promise((resolve, reject) => {
      const toResponse = (data: unknown, status: number): AxiosResponse => ({
        data,
        status,
        statusText: "",
        headers: {},
        config,
      });

      // 自訂 adapter 不會自動處理 signal
      config.signal?.addEventListener?.("abort", () =>
        reject(new CanceledError(undefined, config)),
      );

      calls.push({
        config,
        respond: (data) => resolve(toResponse(data, 200)),
        fail: (status) =>
          reject(
            new AxiosError(
              `Request failed with status code ${status}`,
              undefined,
              config,
              null,
              toResponse(null, status),
            ),
          ),
        reject,
      });
    });

  return { adapter, calls };
};
