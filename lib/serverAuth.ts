export function isAuthorized(request: Request): boolean {
  const passcode = request.headers.get('x-edit-passcode')
  return typeof passcode === 'string' && passcode.length > 0 && passcode === process.env.EDIT_PASSCODE
}
