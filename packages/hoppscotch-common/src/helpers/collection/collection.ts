import { HoppCollection } from "@hoppscotch/data"
import * as E from "fp-ts/Either"

import { getService } from "~/modules/dioc"
import { GQLTabService } from "~/services/tab/graphql"
import { RESTTabService } from "~/services/tab/rest"
import { runGQLQuery } from "../backend/GQLClient"
import { GetSingleRequestDocument } from "../backend/graphql"
import { HoppInheritedProperty } from "../types/HoppInheritedProperties"
import { getAffectedIndexes } from "./affectedIndex"

/**
 * Resolve save context on reorder
 * @param payload
 * @param payload.lastIndex
 * @param payload.newIndex
 * @param folderPath
 * @param payload.length
 * @returns
 */

export function resolveSaveContextOnCollectionReorder(
  payload: {
    lastIndex: number
    newIndex: number
    folderPath: string
    length?: number // better way to do this? now it could be undefined
  },
  type: "remove" | "drop" = "remove"
) {
  const { lastIndex, folderPath, length } = payload
  let { newIndex } = payload

  if (newIndex > lastIndex) newIndex-- // there is a issue when going down? better way to resolve this?
  if (lastIndex === newIndex) return

  const affectedIndexes = getAffectedIndexes(
    lastIndex,
    newIndex === -1 ? length! : newIndex
  )

  if (newIndex === -1) {
    // if (newIndex === -1) remove it from the map because it will be deleted
    affectedIndexes.delete(lastIndex)
    // when collection deleted opended requests from that collection be affected
    if (type === "remove") {
      resetSaveContextForAffectedRequests(
        folderPath ? `${folderPath}/${lastIndex}` : lastIndex.toString()
      )
    }
  }

  // add folder path as prefix to the affected indexes
  const affectedPaths = new Map<string, string>()
  for (const [key, value] of affectedIndexes) {
    if (folderPath) {
      affectedPaths.set(`${folderPath}/${key}`, `${folderPath}/${value}`)
    } else {
      affectedPaths.set(key.toString(), value.toString())
    }
  }

  const tabService = getService(RESTTabService)

  const tabs = tabService.getTabsRefTo((tab) => {
    if (tab.document.saveContext?.originLocation === "user-collection") {
      return affectedPaths.has(tab.document.saveContext.folderPath)
    }

    if (
      tab.document.saveContext?.originLocation !== "workspace-user-collection"
    ) {
      return false
    }

    const collectionID = tab.document.saveContext.requestID
      .split("/")
      .slice(0, -1)
      .join("/")

    return affectedPaths.has(collectionID)
  })

  for (const tab of tabs) {
    if (tab.value.document.saveContext?.originLocation === "user-collection") {
      const newPath = affectedPaths.get(
        tab.value.document.saveContext?.folderPath
      )!
      tab.value.document.saveContext.folderPath = newPath
    }

    if (
      tab.value.document.saveContext?.originLocation ===
      "workspace-user-collection"
    ) {
      const collectionID = tab.value.document.saveContext.requestID
        .split("/")
        .slice(0, -1)
        .join("/")

      const newCollectionID = affectedPaths.get(collectionID)
      const newRequestID = `${newCollectionID}/${
        tab.value.document.saveContext.requestID.split("/").slice(-1)[0]
      }`

      tab.value.document.saveContext.requestID = newRequestID
    }
  }
}

/**
 * Resolve save context for affected requests on drop folder from one  to another
 * @param oldFolderPath
 * @param newFolderPath
 * @returns
 */

export function updateSaveContextForAffectedRequests(
  oldFolderPath: string,
  newFolderPath: string
) {
  const tabService = getService(RESTTabService)
  const tabs = tabService.getTabsRefTo((tab) => {
    if (tab.document.saveContext?.originLocation === "user-collection") {
      return tab.document.saveContext.folderPath.startsWith(oldFolderPath)
    }

    if (
      tab.document.saveContext?.originLocation !== "workspace-user-collection"
    ) {
      return false
    }

    const collectionID = tab.document.saveContext.requestID
      .split("/")
      .slice(0, -1)
      .join("/")

    return collectionID.startsWith(oldFolderPath)
  })

  for (const tab of tabs) {
    if (tab.value.document.saveContext?.originLocation === "user-collection") {
      tab.value.document.saveContext = {
        ...tab.value.document.saveContext,
        folderPath: tab.value.document.saveContext.folderPath.replace(
          oldFolderPath,
          newFolderPath
        ),
      }
    }

    if (
      tab.value.document.saveContext?.originLocation ===
      "workspace-user-collection"
    ) {
      const collectionID = tab.value.document.saveContext.requestID
        .split("/")
        .slice(0, -1)
        .join("/")

      const newCollectionID = collectionID.replace(oldFolderPath, newFolderPath)
      const newRequestID = `${newCollectionID}/${
        tab.value.document.saveContext.requestID.split("/").slice(-1)[0]
      }`

      tab.value.document.saveContext = {
        ...tab.value.document.saveContext,
        requestID: newRequestID,
      }
    }
  }
}

/**
 * Used to check the new folder path is close to the save context folder path or not
 * @param folderPathCurrent The path saved as the inherited path in the inherited properties
 * @param newFolderPath The incomming path
 * @param saveContextPath The save context of the request
 * @returns The path which is close to saveContext.folderPath
 */
function folderPathCloseToSaveContext(
  folderPathCurrent: string | undefined,
  newFolderPath: string,
  saveContextPath: string
) {
  if (!folderPathCurrent) return newFolderPath
  const folderPathCurrentArray = folderPathCurrent.split("/")
  const newFolderPathArray = newFolderPath.split("/")

  const saveContextFolderPathArray = saveContextPath.split("/")

  let folderPathCurrentMatch = 0

  for (let i = 0; i < folderPathCurrentArray.length; i++) {
    if (folderPathCurrentArray[i] === saveContextFolderPathArray[i]) {
      folderPathCurrentMatch++
    }
  }

  let newFolderPathMatch = 0

  for (let i = 0; i < newFolderPathArray.length; i++) {
    if (newFolderPathArray[i] === saveContextFolderPathArray[i]) {
      newFolderPathMatch++
    }
  }

  if (folderPathCurrentMatch > newFolderPathMatch) {
    return folderPathCurrent
  }
  return newFolderPath
}

export function updateInheritedPropertiesForAffectedRequests(
  path: string,
  inheritedProperties: HoppInheritedProperty,
  type: "rest" | "graphql",
  workspace: "personal" | "team" = "personal"
) {
  const tabService =
    type === "rest" ? getService(RESTTabService) : getService(GQLTabService)

  let tabs
  if (workspace === "personal") {
    tabs = tabService.getTabsRefTo((tab) => {
      if (tab.document.saveContext?.originLocation === "user-collection") {
        return tab.document.saveContext.folderPath.startsWith(path)
      }

      if (
        tab.document.saveContext?.originLocation !== "workspace-user-collection"
      ) {
        return false
      }

      const collectionID = tab.document.saveContext.requestID
        .split("/")
        .slice(0, -1)
        .join("/")

      return collectionID.startsWith(path)
    })
  } else {
    tabs = tabService.getTabsRefTo((tab) => {
      return (
        tab.document.saveContext?.originLocation === "team-collection" &&
        Boolean(tab.document.saveContext.collectionID?.startsWith(path))
      )
    })
  }

  const tabsEffectedByAuth = tabs.filter((tab) => {
    if (workspace === "personal") {
      if (
        tab.value.document.saveContext?.originLocation === "user-collection"
      ) {
        return (
          tab.value.document.saveContext.folderPath.startsWith(path) &&
          path ===
            folderPathCloseToSaveContext(
              tab.value.document.inheritedProperties?.auth.parentID,
              path,
              tab.value.document.saveContext.folderPath
            )
        )
      }

      if (
        tab.value.document.saveContext?.originLocation !==
        "workspace-user-collection"
      ) {
        return false
      }

      const collectionID = tab.value.document.saveContext.requestID
        .split("/")
        .slice(0, -1)
        .join("/")

      return (
        collectionID.startsWith(path) &&
        path ===
          folderPathCloseToSaveContext(
            tab.value.document.inheritedProperties?.auth.parentID,
            path,
            collectionID
          )
      )
    }

    return (
      tab.value.document.saveContext?.originLocation === "team-collection" &&
      tab.value.document.saveContext.collectionID?.startsWith(path) &&
      path ===
        folderPathCloseToSaveContext(
          tab.value.document.inheritedProperties?.auth.parentID,
          path,
          tab.value.document.saveContext.collectionID
        )
    )
  })

  const tabsEffectedByHeaders = tabs.filter((tab) => {
    return (
      tab.value.document.inheritedProperties &&
      tab.value.document.inheritedProperties.headers.some(
        (header) => header.parentID === path
      )
    )
  })

  for (const tab of tabsEffectedByAuth) {
    tab.value.document.inheritedProperties = inheritedProperties
  }

  for (const tab of tabsEffectedByHeaders) {
    const headers = tab.value.document.inheritedProperties?.headers.map(
      (header) => {
        if (header.parentID === path) {
          return {
            ...header,
            inheritedHeader: inheritedProperties.headers.find(
              (inheritedHeader) =>
                inheritedHeader.inheritedHeader?.key ===
                header.inheritedHeader?.key
            )?.inheritedHeader,
          }
        }
        return header
      }
    )

    tab.value.document.inheritedProperties = {
      ...tab.value.document.inheritedProperties,
      headers,
    }
  }
}

function resetSaveContextForAffectedRequests(folderPath: string) {
  const tabService = getService(RESTTabService)
  const tabs = tabService.getTabsRefTo((tab) => {
    if (tab.document.saveContext?.originLocation === "user-collection") {
      return tab.document.saveContext.folderPath.startsWith(folderPath)
    }

    if (
      tab.document.saveContext?.originLocation !== "workspace-user-collection"
    ) {
      return false
    }

    const collectionID = tab.document.saveContext.requestID
      .split("/")
      .slice(0, -1)
      .join("/")

    return collectionID.startsWith(folderPath)
  })

  for (const tab of tabs) {
    tab.value.document.saveContext = null
    tab.value.document.isDirty = true
  }
}

/**
 * Reset save context to null if requests are deleted from the team collection or its folder
 * only runs when collection or folder is deleted
 */

export async function resetTeamRequestsContext() {
  const tabService = getService(RESTTabService)
  const tabs = tabService.getTabsRefTo((tab) => {
    return tab.document.saveContext?.originLocation === "team-collection"
  })

  for (const tab of tabs) {
    if (tab.value.document.saveContext?.originLocation === "team-collection") {
      const data = await runGQLQuery({
        query: GetSingleRequestDocument,
        variables: {
          requestID: tab.value.document.saveContext?.requestID,
        },
      })

      if (E.isRight(data) && data.right.request === null) {
        tab.value.document.saveContext = null
        tab.value.document.isDirty = true
      }
    }
  }
}

export function getFoldersByPath(
  collections: HoppCollection[],
  path: string
): HoppCollection[] {
  if (!path) return collections

  // path will be like this "0/0/1" these are the indexes of the folders
  const pathArray = path.split("/").map((index) => parseInt(index))

  let currentCollection = collections[pathArray[0]]

  if (pathArray.length === 1) {
    return currentCollection.folders
  }
  for (let i = 1; i < pathArray.length; i++) {
    const folder = currentCollection.folders[pathArray[i]]
    if (folder) currentCollection = folder
  }

  return currentCollection.folders
}
