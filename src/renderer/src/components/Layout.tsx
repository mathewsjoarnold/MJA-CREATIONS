import Sidebar from '@components/ui/Sidebar'
import { ToastContainer } from '@components/ui/Toast'
import { Outlet } from 'react-router'

export default function Layout() {
  return (
    <div className="flex w-full h-screen overflow-hidden">
      <Sidebar />

      <main className="bg-main-bg text-white nonSelectable grow-1 pl-56 h-screen overflow-y-auto overflow-x-hidden">
        <Outlet />
      </main>

      <ToastContainer />
    </div>
  )
}
