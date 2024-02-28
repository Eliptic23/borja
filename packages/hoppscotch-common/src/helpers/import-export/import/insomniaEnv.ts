import * as TE from "fp-ts/TaskEither"
import * as O from "fp-ts/Option"

import { IMPORTER_INVALID_FILE_FORMAT } from "."

import { z } from "zod"
import { NonSecretEnvironment } from "@hoppscotch/data"
import { safeParseJSONOrYAML } from "~/helpers/functional/yaml"
import { uniqueId } from "lodash-es"

const insomniaResourcesSchema = z.object({
  resources: z.array(
    z
      .object({
        _type: z.string(),
      })
      .passthrough()
  ),
})

const insomniaEnvSchema = z.object({
  _type: z.literal("environment"),
  name: z.string(),
  data: z.record(z.string()),
})

export const replaceInsomniaTemplating = (expression: string) => {
  const regex = /\{\{ _\.([^}]+) \}\}/g
  return expression.replaceAll(regex, "<<$1>>")
}

export const insomniaEnvImporter = (content: string) => {
  const parsedContent = safeParseJSONOrYAML(content)

  if (O.isNone(parsedContent)) {
    return TE.left(IMPORTER_INVALID_FILE_FORMAT)
  }

  const validationResult = z
    .array(insomniaResourcesSchema)
    .safeParse(parsedContent.value)

  if (!validationResult.success) {
    return TE.left(IMPORTER_INVALID_FILE_FORMAT)
  }

  const insomniaEnvs = validationResult.data.flatMap(({ resources }) => {
    return resources
      .filter((resource) => resource._type === "environment")
      .map((envResource) => {
        const envResourceData = envResource.data as Record<string, unknown>
        const stringifiedData: Record<string, string> = {}

        Object.keys(envResourceData).forEach((key) => {
          stringifiedData[key] = String(envResourceData[key])
        })

        return { ...envResource, data: stringifiedData }
      })
  })

  const environments: NonSecretEnvironment[] = []

  insomniaEnvs.forEach((insomniaEnv) => {
    const parsedInsomniaEnv = insomniaEnvSchema.safeParse(insomniaEnv)

    if (parsedInsomniaEnv.success) {
      const environment: NonSecretEnvironment = {
        id: uniqueId(),
        v: 1,
        name: parsedInsomniaEnv.data.name,
        variables: Object.entries(parsedInsomniaEnv.data.data).map(
          ([key, value]) => ({ key, value, secret: false })
        ),
      }

      environments.push(environment)
    }
  })

  const processedEnvironments = environments.map((env) => ({
    ...env,
    variables: env.variables.map((variable) => ({
      ...variable,
      value: replaceInsomniaTemplating(variable.value),
    })),
  }))

  return TE.right(processedEnvironments)
}
