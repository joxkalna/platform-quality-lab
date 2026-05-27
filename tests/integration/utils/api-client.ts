import axios from 'axios'

import type { AxiosError } from 'axios'

type RequestOptions = {
  timeout?: number
}

export const createApiClient = (baseUrl: string) => ({
  get: async (path: string, options: RequestOptions = {}) => {
    try {
      return await axios.get(`${baseUrl}${path}`, {
        timeout: options.timeout ?? 5000,
      })
    } catch (err) {
      const error = err as AxiosError
      if (error.response) return error.response
      throw error
    }
  },

  post: async (path: string, body: unknown, options: RequestOptions = {}) => {
    try {
      return await axios.post(`${baseUrl}${path}`, body, {
        timeout: options.timeout ?? 5000,
      })
    } catch (err) {
      const error = err as AxiosError
      if (error.response) return error.response
      throw error
    }
  },
})
