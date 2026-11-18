import ReactMarkdown from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';
import { classNames } from '../utils';

export interface CardDescriptionProps {
  text: string;
  compact?: boolean;
  className?: string;
}

/**
 * Renderiza a descrição do cartão em Markdown (o mesmo formato usado pelo
 * Trello). HTML bruto fica desativado; links abrem em nova aba.
 */
export function CardDescription({ text, compact = false, className }: CardDescriptionProps) {
  return (
    <div className={classNames('sf-markdown', compact && 'sf-markdown--compact', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        skipHtml
        components={{
          a: ({ node, ...props }) => {
            void node;
            return <a {...props} target="_blank" rel="noreferrer noopener" />;
          },
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
