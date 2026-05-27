import { agentHandlers } from './agent'
import { classifyHandlers } from './classify'
import { dataHandlers } from './data'
import { healthHandlers } from './health'

export const handlers = [
  ...classifyHandlers,
  ...dataHandlers,
  ...healthHandlers,
  ...agentHandlers,
]
