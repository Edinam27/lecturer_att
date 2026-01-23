import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-config';
import { prisma } from '@/lib/db';
import jwt from 'jsonwebtoken';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    // Check permissions
    if (!session?.user || (session.user.role !== 'ADMIN' && session.user.role !== 'COORDINATOR')) {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { targetUserId } = body;

    if (!targetUserId) {
      return NextResponse.json(
        { error: 'Target User ID is required' },
        { status: 400 }
      );
    }

    // Verify target user exists
    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId }
    });

    if (!targetUser) {
      return NextResponse.json(
        { error: 'Target user not found' },
        { status: 404 }
      );
    }

    // Generate impersonation token
    // Short expiry (e.g., 5 minutes)
    const secret = process.env.NEXTAUTH_SECRET;
    if (!secret) {
        console.error("NEXTAUTH_SECRET is not defined in environment variables");
        throw new Error("NEXTAUTH_SECRET is not defined");
    }

    console.log(`Generating impersonation token for targetUser: ${targetUser.id} by initiator: ${session.user.id}`);

    const token = jwt.sign(
      { 
        targetUserId: targetUser.id,
        targetEmail: targetUser.email,
        type: 'impersonation',
        initiatorId: session.user.id
      },
      secret,
      { expiresIn: '5m' }
    );

    return NextResponse.json({ token });

  } catch (error) {
    console.error('Error generating impersonation token:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
