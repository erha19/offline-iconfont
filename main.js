const fs = require('fs')
const path = require('path')
const stream = require('stream')
const { promisify } = require('util')

const got = require('got')
const ora = require('ora')

const iconFontCNCssRegex = /\/\/at\.alicdn\.com\/t\/(a\/)?font\w+\.css/i

// eslint-disable-next-line node/no-deprecated-api
const fsReadFile = promisify(fs.readFile)
const fsRename = promisify(fs.rename)
const fsWriteFile = promisify(fs.writeFile)
const fsMkdir = promisify(fs.mkdir)
const fsUnlink = promisify(fs.unlink)
const streamPipeline = promisify(stream.pipeline)

const defaultExtnameList = ['css', 'woff', 'woff2', 'ttf']

// 默认的 iconfont.cn 下载下来的 css 中包含的是字体文件的在线地址
// 需要转换成本地字体文件地址
async function offlineCss(config) {
  const { cssUrl, dir, filename } = config
  const downloadUrlPrefix = cssUrl.replace(/.css$/g, '')

  const cssFilePath = path.join(dir, filename + '.css')

  if (!fs.existsSync(dir)) {
    throw new Error('🚔 Cannot found the css file:' + dir)
  }

  const spinner = ora('🚀 Starting to offline css file').start()
  const cssFileContent = await fsReadFile(cssFilePath, { encoding: 'utf8' })
  const updatedCssFileContent = cssFileContent.replace(
    new RegExp(downloadUrlPrefix, 'g'),
    filename
  )
  await fsWriteFile(cssFilePath, updatedCssFileContent, { encoding: 'utf8' })
  spinner.succeed('💪 Finish')
}

const backupSuffix = '_iconfont_asset_backup'

async function backup(filenameList, dir) {
  const spinner = ora('🔙 Trying to backup your files').start()
  try {
    await Promise.all(
      filenameList.map(async filename => {
        const targetFilePath = path.join(dir, filename)
        if (fs.existsSync(targetFilePath)) {
          const newFilename = targetFilePath + backupSuffix
          await fsRename(targetFilePath, newFilename)
          return newFilename
        }
      })
    )
    spinner.succeed('💪 Finish backup')
  } catch (err) {
    spinner.fail('🔙 Backup failed')
    console.error(err)

    console.log('🏬 Trying to restore your files')
    restore(
      filenameList.map(n => n + backupSuffix),
      dir
    )
  }
}

async function restore(filenameList, dir) {
  const spinner = ora('🏬 Trying to restore your files').start()
  try {
    await Promise.all(
      filenameList.map(async filename => {
        const targetFilePath = path.join(dir, filename)
        if (fs.existsSync(targetFilePath)) {
          const originFilename = targetFilePath.replace(
            new RegExp(backupSuffix, '$'),
            ''
          )
          await fsRename(targetFilePath, originFilename)
          return originFilename
        }
      })
    )
    spinner.succeed('💪 Finish restore')
  } catch (err) {
    spinner.fail('🏬 Restore failed')
    console.error(err)
  }
}

async function removeBackups(filenameList, dir) {
  const spinner = ora('␡ Trying to clean up backup files').start()
  try {
    await Promise.all(
      filenameList.map(async filename => {
        const targetFilePath = path.join(dir, filename)
        if (fs.existsSync(targetFilePath)) {
          await fsUnlink(targetFilePath)
        }
      })
    )
    spinner.succeed('💪 Finish cleaning up')
  } catch (err) {
    spinner.fail('␡ Clean up failed')
    console.error(err)
  }
}

async function download(config) {
  const {
    cssUrl,
    dir = process.cwd(),
    filename = 'iconfont',
    cssOffline = true,
    extnameList = defaultExtnameList
  } = config
  if (!iconFontCNCssRegex.test(cssUrl)) {
    throw new Error('🚔 Invalid iconfont.cn css url' + cssUrl)
  }

  const filenameList = extnameList.map(extname =>
    path.join(dir, `${filename}.${extname}`)
  )

  try {
    if (!fs.existsSync(dir)) {
      console.warn('🐛 Invalid target dir' + dir)
      await fsMkdir(dir, { recursive: true })
      console.log('🚀 Created this dir:', dir)
    }

    await backup(filenameList, dir)

    const downloadUrlPrefix = cssUrl.replace(/.css$/g, '')

    const spinner = ora(
      '🚀 Starting to download files from iconfont.cn'
    ).start()
    await Promise.all(
      extnameList.map(extname => {
        const downloadUrl = `${downloadUrlPrefix}.${extname}`
        return streamPipeline(
          got.stream('http:' + downloadUrl),
          fs.createWriteStream(path.join(dir, `${filename}.${extname}`))
        )
      })
    )

    spinner.succeed('💪 Finish downloading')

    console.log(
      `⚠️ Warning: Please Please pay attention to the legality and certificate of the downloaded resources from ${cssUrl}`
    )

    if (cssOffline && extnameList.includes('css')) {
      await offlineCss({ cssUrl, dir, filename })
    }

    await removeBackups(filenameList, dir)
  } catch (err) {
    console.error('🚔 Restore failed')
    console.error(err)

    await restore(
      filenameList.map(filename => filename + backupSuffix),
      dir
    )
  }
}

module.exports = download
