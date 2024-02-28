import {
  HoppCollection,
  HoppRESTAuth,
  HoppRESTHeader,
  HoppRESTParam,
  HoppRESTReqBody,
  HoppRESTRequest,
  knownContentTypes,
  makeCollection,
  makeRESTRequest,
} from "@hoppscotch/data"

import * as A from "fp-ts/Array"
import * as TE from "fp-ts/TaskEither"
import * as TO from "fp-ts/TaskOption"
import { pipe } from "fp-ts/function"
import { ImportRequest, convert } from "insomnia-importers"

import { IMPORTER_INVALID_FILE_FORMAT } from "."
import { replaceInsomniaTemplating } from "./insomniaEnv"

// TODO: Insomnia allows custom prefixes for Bearer token auth, Hoppscotch doesn't. We just ignore the prefix for now

type UnwrapPromise<T extends Promise<any>> = T extends Promise<infer Y>
  ? Y
  : never

type InsomniaDoc = UnwrapPromise<ReturnType<typeof convert>>
type InsomniaResource = ImportRequest

type InsomniaFolderResource = ImportRequest & { _type: "request_group" }
type InsomniaRequestResource = ImportRequest & { _type: "request" }

const parseInsomniaDoc = (content: string) =>
  TO.tryCatch(() => convert(content))

const replaceVarTemplating = (expression: string) =>
  replaceInsomniaTemplating(expression)

const getFoldersIn = (
  folder: InsomniaFolderResource | null,
  resources: InsomniaResource[]
) =>
  pipe(
    resources,
    A.filter(
      (x): x is InsomniaFolderResource =>
        (x._type === "request_group" || x._type === "workspace") &&
        x.parentId === (folder?._id ?? null)
    )
  )

const getRequestsIn = (
  folder: InsomniaFolderResource | null,
  resources: InsomniaResource[]
) =>
  pipe(
    resources,
    A.filter(
      (x): x is InsomniaRequestResource =>
        x._type === "request" && x.parentId === (folder?._id ?? null)
    )
  )

/**
 * The provided type by insomnia-importers, this type corrects it
 */
type InsoReqAuth =
  | { type: "basic"; disabled?: boolean; username?: string; password?: string }
  | {
      type: "oauth2"
      disabled?: boolean
      accessTokenUrl?: string
      authorizationUrl?: string
      clientId?: string
      scope?: string
    }
  | {
      type: "bearer"
      disabled?: boolean
      token?: string
    }

const getHoppReqAuth = (req: InsomniaRequestResource): HoppRESTAuth => {
  if (!req.authentication) return { authType: "none", authActive: true }

  const auth = req.authentication as InsoReqAuth

  if (auth.type === "basic")
    return {
      authType: "basic",
      authActive: true,
      username: replaceVarTemplating(auth.username ?? ""),
      password: replaceVarTemplating(auth.password ?? ""),
    }
  else if (auth.type === "oauth2")
    return {
      authType: "oauth-2",
      authActive: !(auth.disabled ?? false),
      accessTokenURL: replaceVarTemplating(auth.accessTokenUrl ?? ""),
      authURL: replaceVarTemplating(auth.authorizationUrl ?? ""),
      clientID: replaceVarTemplating(auth.clientId ?? ""),
      oidcDiscoveryURL: "",
      scope: replaceVarTemplating(auth.scope ?? ""),
      token: "",
    }
  else if (auth.type === "bearer")
    return {
      authType: "bearer",
      authActive: true,
      token: replaceVarTemplating(auth.token ?? ""),
    }

  return { authType: "none", authActive: true }
}

const getHoppReqBody = (req: InsomniaRequestResource): HoppRESTReqBody => {
  if (!req.body) return { contentType: null, body: null }

  if (typeof req.body === "string") {
    const contentType =
      req.headers?.find(
        (header) => header.name.toLowerCase() === "content-type"
      )?.value ?? "text/plain"

    return { contentType, body: replaceVarTemplating(req.body) }
  }

  if (req.body.mimeType === "multipart/form-data") {
    return {
      contentType: "multipart/form-data",
      body:
        req.body.params?.map((param) => ({
          key: replaceVarTemplating(param.name),
          value: replaceVarTemplating(param.value ?? ""),
          active: !(param.disabled ?? false),
          isFile: false,
        })) ?? [],
    }
  } else if (req.body.mimeType === "application/x-www-form-urlencoded") {
    return {
      contentType: "application/x-www-form-urlencoded",
      body:
        req.body.params
          ?.filter((param) => !(param.disabled ?? false))
          .map(
            (param) =>
              `${replaceVarTemplating(param.name)}: ${replaceVarTemplating(
                param.value ?? ""
              )}`
          )
          .join("\n") ?? "",
    }
  } else if (
    Object.keys(knownContentTypes).includes(req.body.mimeType ?? "text/plain")
  ) {
    return {
      contentType: (req.body.mimeType ?? "text/plain") as any,
      body: replaceVarTemplating(req.body.text ?? "") as any,
    }
  }

  return { contentType: null, body: null }
}

const getHoppReqHeaders = (req: InsomniaRequestResource): HoppRESTHeader[] =>
  req.headers?.map((header) => ({
    key: replaceVarTemplating(header.name),
    value: replaceVarTemplating(header.value),
    active: !header.disabled,
  })) ?? []

const getHoppReqParams = (req: InsomniaRequestResource): HoppRESTParam[] =>
  req.parameters?.map((param) => ({
    key: replaceVarTemplating(param.name),
    value: replaceVarTemplating(param.value ?? ""),
    active: !(param.disabled ?? false),
  })) ?? []

const getHoppRequest = (req: InsomniaRequestResource): HoppRESTRequest =>
  makeRESTRequest({
    name: req.name ?? "Untitled Request",
    method: req.method?.toUpperCase() ?? "GET",
    endpoint: replaceVarTemplating(req.url ?? ""),
    auth: getHoppReqAuth(req),
    body: getHoppReqBody(req),
    headers: getHoppReqHeaders(req),
    params: getHoppReqParams(req),

    preRequestScript: "",
    testScript: "",
  })

const getHoppFolder = (
  folderRes: InsomniaFolderResource,
  resources: InsomniaResource[]
): HoppCollection =>
  makeCollection({
    name: folderRes.name ?? "",
    folders: getFoldersIn(folderRes, resources).map((f) =>
      getHoppFolder(f, resources)
    ),
    requests: getRequestsIn(folderRes, resources).map(getHoppRequest),
    auth: { authType: "inherit", authActive: true },
    headers: [],
  })

const getHoppCollections = (docs: InsomniaDoc[]) => {
  return docs.flatMap((doc) => {
    return getFoldersIn(null, doc.data.resources).map((f) =>
      getHoppFolder(f, doc.data.resources)
    )
  })
}

export const hoppInsomniaImporter = (fileContents: string[]) =>
  pipe(
    fileContents,
    A.traverse(TO.ApplicativeSeq)(parseInsomniaDoc),
    TO.map(getHoppCollections),
    TE.fromTaskOption(() => IMPORTER_INVALID_FILE_FORMAT)
  )
