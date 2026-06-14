import type { NextApiRequest, NextApiResponse } from 'next';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createClient } from '@supabase/supabase-js';

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!
  }
});

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const token = req.headers.authorization?.split(' ')[1];
  const { fileName, fileType } = req.body;

  if (!fileName || !fileType) {
    return res.status(400).json({ success: false, error: 'Missing fileName or fileType params' });
  }

  try {
    const { data: { user } } = await supabaseAdmin.auth.getUser(token);
    if (!user) return res.status(401).json({ success: false, error: 'Unauthorized gateway access' });

    const objectKey = `workspaces/${user.id}/${Date.now()}-${fileName}`;

    const command = new PutObjectCommand({
      Bucket: 'ai-agent-workspace-falullah', // 🔥 UPDATED TO YOUR UNIQUE BUCKET NAME
      Key: objectKey,
      ContentType: fileType,
    });

    const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 60 });
    const publicUrl = `https://ai-agent-workspace-falullah.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${objectKey}`;

    return res.status(200).json({
      success: true,
      data: {
        uploadUrl,
        publicUrl,
        fileKey: objectKey
      }
    });

  } catch (error: any) {
    console.error('❌ S3 storage shielding error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
