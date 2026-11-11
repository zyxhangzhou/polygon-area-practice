/** 统一错误响应格式：{ error: { code, message } } */
export function errorBody(code: string, message: string) {
  return { error: { code, message } };
}
