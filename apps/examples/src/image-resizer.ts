/// <reference lib="webworker" />
const p = <T>(request: IDBRequest<T>) =>
	new Promise<T>((resolve, reject) => {
		request.onsuccess = () => resolve(request.result)
		request.onerror = () => reject(request.error)
	})

const db = p(indexedDB.open('TLDRAW_DOCUMENT_v2example'))

const get = async <T>(table: string, key: string) =>
	await p<T>((await db).transaction(table).objectStore(table).get(key))

const pattern = new URLPattern({ pathname: '/image-resize/:id/:width/:height' })
addEventListener('fetch', (event) => {
	const url = new URL(event.request.url)
	const match = pattern.exec(url)
	if (match) {
		event.respondWith(handleImageResize(url, match.pathname.groups))
	}
})

async function handleImageResize(
	url: URL,
	{ id, width: w, height: h }: { id: string; width: string; height: string }
) {
	const cache = await caches.open('image-resizer-cache-v1')
	const cached = await cache.match(url)
	if (cached) return cached

	const width = parseInt(w)
	const height = parseInt(h)
	const originalImage = await get<File>('assets', id)
	const imageBitmap = await createImageBitmap(originalImage)
	// TODO store original size
	if (imageBitmap.width <= width || imageBitmap.height <= height) {
		console.log(`Using original image ${id} for ${w}x${h}`)
		return new Response(originalImage, {
			status: 200,
			headers: {
				'content-type': originalImage.type,
				'content-length': `${originalImage.size}`,
				'cache-control': 'public, max-age=31536000, immutable',
			},
		})
	}

	console.log(`Resizing image ${id} to ${w}x${h}`)
	// TODO batch all mips, 0.5x, 0.25x, 2x? base w/h
	const canvas = new OffscreenCanvas(width, height)
	const ctx = canvas.getContext('2d')!
	ctx.drawImage(imageBitmap, 0, 0, imageBitmap.width, imageBitmap.height, 0, 0, width, height)
	const resizedBlob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.8 })
	const response = new Response(resizedBlob, {
		status: 200,
		headers: {
			'content-type': resizedBlob.type,
			'content-length': `${resizedBlob.size}`,
			'cache-control': 'public, max-age=31536000, immutable',
		},
	})
	await cache.put(url, response.clone())
	return response
}
