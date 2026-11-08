export interface UrlParts {
  readonly beforeHost: string;
  readonly host: string;
  readonly afterHost: string;
}

// The host is what decides where a link leads, so it is singled out for
// emphasis. Userinfo ("https://bank.example@evil.example/") and the port stay
// outside the host part.
export function splitUrl(text: string): UrlParts | null {
  const match = /^(https?:\/\/)([^/?#]*)(.*)$/is.exec(text);
  if (!match) return null;
  const [, scheme = '', authority = '', rest = ''] = match;
  const at = authority.lastIndexOf('@');
  const userinfo = at >= 0 ? authority.slice(0, at + 1) : '';
  const hostPort = authority.slice(at + 1);
  const portMatch = /:\d*$/.exec(hostPort);
  const host = portMatch ? hostPort.slice(0, portMatch.index) : hostPort;
  const port = portMatch ? portMatch[0] : '';
  if (host === '') return null;
  return { beforeHost: scheme + userinfo, host, afterHost: port + rest };
}
