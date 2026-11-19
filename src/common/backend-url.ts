import { BadRequestException } from '@nestjs/common';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '10.0.2.2']);

/** The client backend that receives the captured SMS: https only, except local hosts outside production. */
export function normalizeBackendUrl(
  input: string,
  production: boolean,
): string {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new BadRequestException('URL du backend invalide.');
  }
  const localHttp =
    url.protocol === 'http:' && LOCAL_HOSTS.has(url.hostname) && !production;
  if (url.protocol !== 'https:' && !localHttp) {
    throw new BadRequestException(
      'L’URL du backend doit commencer par https://',
    );
  }
  if (url.search || url.hash || url.username || url.password) {
    throw new BadRequestException(
      'L’URL du backend ne doit contenir ni paramètres ni identifiants.',
    );
  }
  return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
}
