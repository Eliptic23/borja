import {
  ChildrenResult,
  SmartTreeAdapter,
} from "@hoppscotch/ui/dist/src/helpers/treeAdapter"
import { Ref, ref, watchEffect } from "vue"
import { NewWorkspaceService } from "~/services/new-workspace"
import { HandleRef } from "~/services/new-workspace/handle"
import { RESTCollectionViewItem } from "~/services/new-workspace/view"
import { Workspace } from "~/services/new-workspace/workspace"
import * as E from "fp-ts/Either"

export class WorkspaceRESTCollectionTreeAdapter
  implements SmartTreeAdapter<RESTCollectionViewItem>
{
  constructor(
    private workspaceHandle: HandleRef<Workspace>,
    private workspaceService: NewWorkspaceService
  ) {}

  public getChildren(
    nodeID: string | null
  ): Ref<ChildrenResult<RESTCollectionViewItem>> {
    if (this.workspaceHandle.value.type !== "ok") {
      throw new Error("Cannot issue children with invalid workspace handle")
    }

    const result = ref<ChildrenResult<RESTCollectionViewItem>>({
      status: "loading",
    })

    if (nodeID !== null) {
      ;(async () => {
        const collectionHandleResult =
          await this.workspaceService.getCollectionHandle(
            this.workspaceHandle,
            nodeID
          )

        // TODO: Better error handling
        if (E.isLeft(collectionHandleResult)) {
          throw new Error(JSON.stringify(collectionHandleResult.left.error))
        }

        const collectionHandle = collectionHandleResult.right

        const collectionChildrenResult =
          await this.workspaceService.getRESTCollectionChildrenView(
            collectionHandle
          )

        // TODO: Better error handling
        if (E.isLeft(collectionChildrenResult)) {
          throw new Error(JSON.stringify(collectionChildrenResult.left.error))
        }

        const collectionChildrenViewHandle = collectionChildrenResult.right

        watchEffect(() => {
          if (collectionChildrenViewHandle.value.type !== "ok") return

          if (collectionChildrenViewHandle.value.data.loading.value) {
            result.value = {
              status: "loading",
            }
          } else {
            result.value = {
              status: "loaded",
              data: collectionChildrenViewHandle.value.data.content.value.map(
                (item) => ({
                  id:
                    item.type === "request"
                      ? item.value.requestID
                      : item.value.collectionID,

                  data: item,
                })
              ),
            }
          }
        })
      })()
    } else {
      ;(async () => {
        const viewResult =
          await this.workspaceService.getRESTRootCollectionView(
            this.workspaceHandle
          )

        // TODO: Better error handling
        if (E.isLeft(viewResult)) {
          throw new Error(JSON.stringify(viewResult.left.error))
        }

        const viewHandle = viewResult.right

        watchEffect(() => {
          if (viewHandle.value.type !== "ok") return

          if (viewHandle.value.data.loading.value) {
            result.value = {
              status: "loading",
            }
          } else {
            result.value = {
              status: "loaded",
              data: viewHandle.value.data.collections.value.map((coll) => ({
                id: coll.collectionID,

                data: {
                  type: "collection",
                  value: coll,
                },
              })),
            }
          }
        })
      })()
    }

    return result
  }
}
