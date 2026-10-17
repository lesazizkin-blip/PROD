// Integrator tool. Run from frontend only after adding pinned tesseract.js@6.0.1.
// Usage: node src/features/recognition/vendor-assets.mjs /absolute/path/eng.traineddata.gz
// This script never uploads/downloads images or models.
import { copyFile, cp, mkdir, readFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'

const require = createRequire(resolve('package.json'))
const packagePath = require.resolve('tesseract.js/package.json')
const pkg = JSON.parse(await readFile(packagePath, 'utf8'))
if (pkg.version !== '6.0.1') throw new Error('Prototype was tested with tesseract.js@6.0.1 only')
if (!process.argv[2]) throw new Error('Pass local eng.traineddata.gz path; see INTEGRATION.txt')
const model = await readFile(process.argv[2])
const digest = createHash('sha256').update(model).digest('hex')
if (digest !== 'ed350f3752f81ee8f38769edc14d92d997dababe23b565c59879372cc46a2468') throw new Error('Unexpected model digest; verify the model and update the integration deliberately')
const destination = resolve('public/recognition')
await mkdir(resolve(destination, 'lang'), { recursive: true })
for (const name of ['tesseract.esm.min.js', 'worker.min.js']) await copyFile(resolve(dirname(packagePath), 'dist', name), resolve(destination, name))
const core = dirname(require.resolve('tesseract.js-core/package.json'))
if (JSON.parse(await readFile(resolve(core, 'package.json'), 'utf8')).version !== '6.1.2') throw new Error('Prototype was tested with tesseract.js-core@6.1.2 only')
await cp(core, resolve(destination, 'core'), { recursive: true })
await copyFile(process.argv[2], resolve(destination, 'lang/eng.traineddata.gz'))
console.log('Local prototype assets prepared. Enable VITE_LOCAL_OCR_PROTOTYPE only for evaluation.')
