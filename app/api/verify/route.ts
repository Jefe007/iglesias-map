export async function POST(request: Request) {
  const { passcode } = await request.json()
  const ok = typeof passcode === 'string' && passcode.length > 0 && passcode === process.env.EDIT_PASSCODE
  return Response.json({ ok })
}
