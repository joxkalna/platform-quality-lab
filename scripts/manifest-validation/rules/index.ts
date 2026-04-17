import type { Rule } from '../types'

import { replicasMinimum } from './replicasMinimum'
import { resourceLimits } from './resourceLimits'
import { probesExist } from './probesExist'
import { probeSeparation } from './probeSeparation'
import { memoryLimitRatio } from './memoryLimitRatio'

export const rules: Rule[] = [
  replicasMinimum,
  resourceLimits,
  probesExist,
  probeSeparation,
  memoryLimitRatio,
]
