import Layout from '@components/Layout'
import Home from '@pages/Home'
import Information from '@pages/Information'
import MusicSync from '@pages/MusicSync'
import Scenes from '@pages/Scenes'
import { ReactNode } from 'react'
import { createHashRouter, RouterProvider } from 'react-router'

const router = createHashRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      {
        path: '/',
        element: <Home />
      },
      {
        path: '/scenes',
        element: <Scenes />
      },
      {
        path: '/music-sync',
        element: <MusicSync />
      },
      {
        path: '/information',
        element: <Information />
      }
    ]
  }
])

function App(): ReactNode {
  return <RouterProvider router={router} />
}

export default App
