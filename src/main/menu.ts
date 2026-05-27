import { app, BrowserWindow, dialog, Menu } from 'electron'
import type { MenuItemConstructorOptions } from 'electron'
import type { RecentRepo } from '@shared/types'
import { Channels } from '@shared/channels'

function sendToRenderer(channel: string, ...args: unknown[]): void {
  const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  if (win && !win.isDestroyed()) {
    win.webContents.send(channel, ...args)
  }
}

export function buildAppMenu(recents: RecentRepo[]): void {
  const recentSubmenu: MenuItemConstructorOptions[] =
    recents.length === 0
      ? [{ label: 'No Recent Repositories', enabled: false }]
      : [
          ...recents.map(
            (r): MenuItemConstructorOptions => ({
              label: r.name,
              sublabel: r.path,
              click: () => sendToRenderer(Channels.MenuOpenRepo, r.path)
            })
          ),
          { type: 'separator' },
          {
            label: 'Clear Menu',
            click: () => sendToRenderer(Channels.MenuOpenRepo, '__clear_recents__')
          }
        ]

  const fileMenu: MenuItemConstructorOptions = {
    label: 'File',
    submenu: [
      {
        label: 'Open Repository…',
        accelerator: 'CmdOrCtrl+O',
        click: async () => {
          const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
          if (!win) return
          const result = await dialog.showOpenDialog(win, {
            title: 'Open Repository',
            properties: ['openDirectory', 'createDirectory']
          })
          if (!result.canceled && result.filePaths[0]) {
            sendToRenderer(Channels.MenuOpenRepo, result.filePaths[0])
          }
        }
      },
      {
        label: 'Open Recent',
        submenu: recentSubmenu
      },
      { type: 'separator' },
      {
        label: 'Close Repository',
        click: () => sendToRenderer(Channels.MenuCloseRepo)
      },
      ...(process.platform !== 'darwin'
        ? ([{ type: 'separator' }, { role: 'quit' }] as MenuItemConstructorOptions[])
        : [])
    ]
  }

  const template: MenuItemConstructorOptions[] = [
    ...(process.platform === 'darwin'
      ? ([
          {
            label: app.name,
            submenu: [
              { role: 'about' },
              { type: 'separator' },
              { role: 'services' },
              { type: 'separator' },
              { role: 'hide' },
              { role: 'hideOthers' },
              { role: 'unhide' },
              { type: 'separator' },
              { role: 'quit' }
            ]
          }
        ] as MenuItemConstructorOptions[])
      : []),
    fileMenu,
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
