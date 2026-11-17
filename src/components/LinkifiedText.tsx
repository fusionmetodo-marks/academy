import React from 'react';
import { ExternalLink } from 'lucide-react';

interface LinkifiedTextProps {
  text: string;
  className?: string;
  linkClassName?: string;
  showExternalIcon?: boolean;
}

const URL_AND_EMAIL_TOKEN_REGEX =
  /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})|((?:https?:\/\/|www\.)[^\s<>"{}|\\^[\]`]+|(?:[a-zA-Z0-9-]+\.)+(?:com|net|org|io|app|dev|ao|pt|br|me|ly|co|tv|edu|gov|ai|xyz|be)(?:\/[^\s<>"{}|\\^[\]`]*)?)/gi;

const stripTrailingPunctuation = (rawUrl: string): { cleanUrl: string; trailing: string } => {
  let cleanUrl = rawUrl;
  let trailing = '';

  while (cleanUrl.length > 0) {
    const lastChar = cleanUrl[cleanUrl.length - 1];
    if ('.,;:!?'.includes(lastChar)) {
      trailing = lastChar + trailing;
      cleanUrl = cleanUrl.slice(0, -1);
      continue;
    }
    if (lastChar === ')') {
      const openCount = (cleanUrl.match(/\(/g) || []).length;
      const closeCount = (cleanUrl.match(/\)/g) || []).length;
      if (closeCount > openCount) {
        trailing = lastChar + trailing;
        cleanUrl = cleanUrl.slice(0, -1);
        continue;
      }
    }
    if (lastChar === ']' || lastChar === '"' || lastChar === "'") {
      trailing = lastChar + trailing;
      cleanUrl = cleanUrl.slice(0, -1);
      continue;
    }
    break;
  }

  return { cleanUrl, trailing };
};

const toSafeHttpUrl = (rawUrl: string): string | null => {
  const candidate = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.toString();
    }
    return null;
  } catch {
    return null;
  }
};

export function LinkifiedText({
  text,
  className = '',
  linkClassName = 'text-[#e9c349] underline decoration-[#e9c349]/75 hover:text-[#f5d76e] font-semibold',
  showExternalIcon = true,
}: LinkifiedTextProps) {
  if (!text) return null;

  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let keyCounter = 0;

  URL_AND_EMAIL_TOKEN_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = URL_AND_EMAIL_TOKEN_REGEX.exec(text)) !== null) {
    const matchIndex = match.index;
    const fullMatch = match[0];
    const emailMatch = match[1];
    const urlMatch = match[2];

    if (matchIndex > lastIndex) {
      nodes.push(
        <React.Fragment key={`txt_${keyCounter++}`}>
          {text.slice(lastIndex, matchIndex)}
        </React.Fragment>
      );
    }

    if (emailMatch || !urlMatch) {
      nodes.push(
        <React.Fragment key={`em_${keyCounter++}`}>{fullMatch}</React.Fragment>
      );
      lastIndex = matchIndex + fullMatch.length;
      continue;
    }

    // Evita transformar sufixos imediatamente colados a letras/números anteriores sem separador (ex: foo.com vs foo@bar)
    const prevChar = matchIndex > 0 ? text[matchIndex - 1] : '';
    const hasInvalidLeadingChar =
      !/^https?:\/\//i.test(urlMatch) &&
      !/^www\./i.test(urlMatch) &&
      prevChar !== '' &&
      /[a-zA-Z0-9_@.]/.test(prevChar);

    if (hasInvalidLeadingChar) {
      nodes.push(
        <React.Fragment key={`raw_${keyCounter++}`}>{fullMatch}</React.Fragment>
      );
      lastIndex = matchIndex + fullMatch.length;
      continue;
    }

    const { cleanUrl, trailing } = stripTrailingPunctuation(urlMatch);
    const safeHref = cleanUrl ? toSafeHttpUrl(cleanUrl) : null;

    if (!safeHref || !cleanUrl) {
      nodes.push(
        <React.Fragment key={`inv_${keyCounter++}`}>{fullMatch}</React.Fragment>
      );
    } else {
      nodes.push(
        <a
          key={`lnk_${keyCounter++}`}
          href={safeHref}
          target="_blank"
          rel="noopener noreferrer"
          title={`Abrir link em nova aba: ${safeHref}`}
          onClick={(e) => e.stopPropagation()}
          className={`break-words [overflow-wrap:anywhere] transition-opacity ${linkClassName}`}
        >
          <span>{cleanUrl}</span>
          {showExternalIcon && (
            <ExternalLink
              className="w-3 h-3 inline-block ml-1 -mt-0.5 align-middle opacity-85"
              aria-hidden="true"
            />
          )}
        </a>
      );
      if (trailing) {
        nodes.push(
          <React.Fragment key={`trl_${keyCounter++}`}>{trailing}</React.Fragment>
        );
      }
    }

    lastIndex = matchIndex + fullMatch.length;
  }

  if (lastIndex < text.length) {
    nodes.push(
      <React.Fragment key={`end_${keyCounter++}`}>
        {text.slice(lastIndex)}
      </React.Fragment>
    );
  }

  return (
    <div className={`whitespace-pre-wrap break-words leading-relaxed ${className}`}>
      {nodes}
    </div>
  );
}
