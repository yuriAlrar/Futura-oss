/**
 * API Client for AWS Lambda + CloudFront
 * Handles automatic SHA256 signature for non-GET requests
 */

interface ApiClientOptions {
  baseURL?: string
  headers?: Record<string, string>
}

interface ApiResponse<T = any> {
  success: boolean
  data?: T
  message?: string
  error?: string
}

export const useApiClient = (options: ApiClientOptions = {}) => {
  const config = useRuntimeConfig()
  const baseURL = options.baseURL || config.public.apiBaseUrl || '/api'

  /**
   * SHA256ハッシュ計算（フロントエンド用）
   */
  const calculateSHA256 = async (data: string): Promise<string> => {
    const encoder = new TextEncoder()
    const dataBuffer = encoder.encode(data)
    const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
  }

  /**
   * API リクエスト送信
   */
  const request = async <T = any>(
    url: string,
    options: {
      method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
      body?: any
      headers?: Record<string, string>
      params?: Record<string, string | number | boolean>
    } = {}
  ): Promise<ApiResponse<T>> => {
    const {
      method = 'GET',
      body,
      headers: customHeaders = {},
      params
    } = options

    // URL構築
    let requestUrl = `${baseURL}${url}`
    if (params) {
      const searchParams = new URLSearchParams()
      Object.entries(params).forEach(([key, value]) => {
        searchParams.append(key, String(value))
      })
      requestUrl += `?${searchParams.toString()}`
    }

    // ヘッダー準備
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...options.headers,
      ...customHeaders
    }

    // リクエストボディの準備
    let requestBody: string | undefined
    if (method !== 'GET') {
      // bodyがundefinedの場合は空のオブジェクトとして処理
      const bodyData = body !== undefined ? body : {}
      requestBody = JSON.stringify(bodyData)
      
      // GET以外のリクエストでx-amz-content-sha256ヘッダを自動付与
      try {
        const contentHash = await calculateSHA256(requestBody)
        headers['x-amz-content-sha256'] = contentHash
      } catch (error) {
        console.warn('SHA256ハッシュ計算に失敗:', error)
      }
    }

    try {
      const response = await fetch(requestUrl, {
        method,
        headers,
        body: requestBody,
        credentials: 'include' // セッションクッキー送信
      })

      if (!response.ok) {
        const errorText = await response.text()
        let errorData: any = {}
        
        try {
          errorData = JSON.parse(errorText)
        } catch {
          errorData = { message: errorText }
        }

        throw new Error(errorData.statusMessage || errorData.message || `HTTP ${response.status}: ${response.statusText}`)
      }

      const data = await response.json()
      console.log('data', data)
      return data as ApiResponse<T>
    } catch (error) {
      console.error('API Request Error:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      }
    }
  }

  // 便利メソッド
  const get = <T = any>(url: string, options?: { params?: Record<string, string | number | boolean> }) =>
    request<T>(url, { method: 'GET', params: options?.params })

  const post = <T = any>(url: string, body?: any, headers?: Record<string, string>) =>
    request<T>(url, { method: 'POST', body, headers })

  const put = <T = any>(url: string, body?: any, headers?: Record<string, string>) =>
    request<T>(url, { method: 'PUT', body, headers })

  const patch = <T = any>(url: string, body?: any, headers?: Record<string, string>) =>
    request<T>(url, { method: 'PATCH', body, headers })

  const del = <T = any>(url: string, headers?: Record<string, string>) =>
    request<T>(url, { method: 'DELETE', headers })

  return {
    request,
    get,
    post,
    put,
    patch,
    delete: del
  }
}