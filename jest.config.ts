import type { Config } from 'jest'
import { getJestProjectsAsync } from '@nx/jest'

const getJestConfig = async (): Promise<Config> => ({
  projects: await getJestProjectsAsync(),
})
export default getJestConfig
