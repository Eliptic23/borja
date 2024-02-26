import {
  HoppCollection,
  HoppGQLRequest,
  HoppRESTRequest,
} from "@hoppscotch/data"
import { getAffectedIndexes } from "./affectedIndex"
import { RESTTabService } from "~/services/tab/rest"
import { getService } from "~/modules/dioc"

/**
 * Resolve save context on reorder
 * @param payload
 * @param payload.lastIndex
 * @param payload.newIndex
 * @param payload.folderPath
 * @param payload.length
 * @returns
 */

export function resolveSaveContextOnRequestReorder(payload: {
  lastIndex: number
  folderPath: string
  newIndex: number
  length?: number // better way to do this? now it could be undefined
}) {
  const { lastIndex, folderPath, length } = payload
  let { newIndex } = payload

  if (newIndex > lastIndex) newIndex-- // there is a issue when going down? better way to resolve this?
  if (lastIndex === newIndex) return

  const affectedIndexes = getAffectedIndexes(
    lastIndex,
    newIndex === -1 ? length! : newIndex
  )

  // if (newIndex === -1) remove it from the map because it will be deleted
  if (newIndex === -1) affectedIndexes.delete(lastIndex)

  const tabService = getService(RESTTabService)
  const tabs = tabService.getTabsRefTo((tab) => {
    if (tab.document.saveContext?.originLocation === "user-collection") {
      return (
        tab.document.saveContext.folderPath === folderPath &&
        affectedIndexes.has(tab.document.saveContext.requestIndex)
      )
    }

    return (
      tab.document.saveContext?.originLocation ===
        "workspace-user-collection" &&
      tab.document.saveContext.collectionID === folderPath &&
      affectedIndexes.has(
        parseInt(tab.document.saveContext.requestID.split("/").slice(-1)[0])
      )
    )
  })

  for (const tab of tabs) {
    if (tab.value.document.saveContext?.originLocation === "user-collection") {
      const newIndex = affectedIndexes.get(
        tab.value.document.saveContext?.requestIndex
      )!
      tab.value.document.saveContext.requestIndex = newIndex
    }
  }
}

export function getRequestsByPath(
  collections: HoppCollection[],
  path: string
): HoppRESTRequest[] | HoppGQLRequest[] {
  // path will be like this "0/0/1" these are the indexes of the folders
  const pathArray = path.split("/").map((index) => parseInt(index))

  let currentCollection = collections[pathArray[0]]

  if (pathArray.length === 1) {
    return currentCollection.requests
  }
  for (let i = 1; i < pathArray.length; i++) {
    const folder = currentCollection.folders[pathArray[i]]
    if (folder) currentCollection = folder
  }

  return currentCollection.requests
}
