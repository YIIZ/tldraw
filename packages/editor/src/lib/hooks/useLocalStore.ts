import { TLAsset, TLAssetStore, TLStoreSnapshot } from '@tldraw/tlschema'
import { WeakCache } from '@tldraw/utils'
import { useEffect } from 'react'
import { TLEditorSnapshot } from '../config/TLEditorSnapshot'
import { TLStoreOptions, createTLStore } from '../config/createTLStore'
import { TLStoreWithStatus } from '../utils/sync/StoreWithStatus'
import { TLLocalSyncClient } from '../utils/sync/TLLocalSyncClient'
import { useShallowObjectIdentity } from './useIdentity'
import { useRefState } from './useRefState'

/** @internal */
export function useLocalStore(
	options: {
		persistenceKey?: string
		sessionId?: string
		snapshot?: TLEditorSnapshot | TLStoreSnapshot
	} & TLStoreOptions
): TLStoreWithStatus {
	const [state, setState] = useRefState<TLStoreWithStatus>({ status: 'loading' })

	options = useShallowObjectIdentity(options)

	useEffect(() => {
		const { persistenceKey, sessionId, ...rest } = options

		if (!persistenceKey) {
			setState({
				status: 'not-synced',
				store: createTLStore(rest),
			})
			return
		}

		setState({ status: 'loading' })

		const objectURLCache = new WeakCache<TLAsset, Promise<string | null>>()
		const assets: TLAssetStore = {
			upload: async (asset, file) => {
				await client.db.storeAsset(asset.id, file)
				return { src: asset.id }
			},
			resolve: async (asset, opt) => {
				if (!asset.props.src) return null

				if (asset.props.src.startsWith('asset:')) {
					// const s = 2 ** Math.ceil(Math.log2(opt.screenScale * opt.dpr))
					const s = opt.steppedScreenScale * opt.dpr
					return `/image-resize/${asset.id}/${Math.floor(asset.props.w * s)}/${Math.floor(asset.props.h * s)}`

					return await objectURLCache.get(asset, async () => {
						const blob = await client.db.getAsset(asset.id)
						if (!blob) return null
						return URL.createObjectURL(blob)
					})
				}

				return asset.props.src
			},
			remove: async (assetIds) => {
				await client.db.removeAssets(assetIds)
			},
			...rest.assets,
		}

		const store = createTLStore({ ...rest, assets })

		let isClosed = false

		const client = new TLLocalSyncClient(store, {
			sessionId,
			persistenceKey,
			onLoad() {
				if (isClosed) return
				setState({ store, status: 'synced-local' })
			},
			onLoadError(err: any) {
				if (isClosed) return
				setState({ status: 'error', error: err })
			},
		})

		return () => {
			isClosed = true
			client.close()
		}
	}, [options, setState])

	return state
}
