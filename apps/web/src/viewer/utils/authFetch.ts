/** Auth-aware fetch — sends Bearer token from localStorage */
export function authFetch(url: string, options: RequestInit = {}) {
  const token = localStorage.getItem('accessToken')
  return fetch(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  })
}
