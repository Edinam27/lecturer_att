import NextAuth, { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import { prisma } from '@/lib/db'
import { verifyPassword } from '@/lib/auth'
import { UserRole } from '@prisma/client'
import jwt from 'jsonwebtoken'

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  providers: [
    CredentialsProvider({
      id: 'impersonation',
      name: 'Impersonation',
      credentials: {
        token: { label: "Token", type: "text" }
      },
      async authorize(credentials) {
        if (!credentials?.token) return null

        try {
          const secret = process.env.NEXTAUTH_SECRET
          if (!secret) {
            console.error("NEXTAUTH_SECRET missing in authorize")
            return null
          }

          const payload = jwt.verify(credentials.token, secret) as any
          console.log("Impersonation token verified for user:", payload.targetUserId)
          
          if (payload.type !== 'impersonation' || !payload.targetUserId) {
            console.error("Invalid impersonation payload", payload)
            return null
          }

          const user = await prisma.user.findUnique({
            where: { id: payload.targetUserId },
            include: {
              lecturer: true
            }
          })

          if (!user || !user.isActive) {
            console.error("Impersonation target user not found or inactive")
            return null
          }

          return {
            id: user.id,
            email: user.email,
            name: `${user.firstName} ${user.lastName}`,
            role: user.role,
            lecturerId: user.lecturer?.id
          }
        } catch (error) {
          console.error('Impersonation auth error:', error)
          return null
        }
      }
    }),
    CredentialsProvider({
      id: 'credentials',
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null
        }

        try {
          const user = await prisma.user.findUnique({
            where: { email: credentials.email },
            include: {
              lecturer: true
            }
          })

          if (!user || !user.isActive) {
            return null
          }

          const isValidPassword = await verifyPassword(
            credentials.password,
            user.passwordHash
          )

          if (!isValidPassword) {
            return null
          }

          return {
            id: user.id,
            email: user.email,
            name: `${user.firstName} ${user.lastName}`,
            role: user.role,
            lecturerId: user.lecturer?.id
          }
        } catch (error) {
          console.error('Auth error:', error)
          return null
        }
      }
    })
  ],
  debug: true,
  session: {
    strategy: 'jwt' as const
  },
  callbacks: {
    async jwt({ token, user }: any) {
      if (user) {
        token.role = user.role
        token.lecturerId = user.lecturerId
      }
      return token
    },
    async session({ session, token }: any) {
      if (token) {
        session.user.id = token.sub!
        session.user.role = token.role as UserRole
        session.user.lecturerId = token.lecturerId as string
      }
      return session
    },
    async redirect({ url, baseUrl }) {
      // Allows relative callback URLs
      if (url.startsWith("/")) return `${baseUrl}${url}`

      // Allows callback URLs on the same origin
      if (new URL(url).origin === baseUrl) return url

      // Explicitly allow production domain for signout redirects
      if (url.startsWith('https://lecturer-att.onrender.com')) return url

      return baseUrl
    }
  },
  pages: {
    signIn: '/auth/signin'
  }
}

// Note: NextAuth handler is created in the API route