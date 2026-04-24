/**
 * JsonLd — inline schema.org JSON-LD injector (T31).
 *
 * Renders a single `<script type="application/ld+json">` tag with the
 * serialised `data` object. Safe against injection because we route
 * through `JSON.stringify` with no user-supplied content paths in the
 * common call sites (the schema objects are built from typed DB rows).
 *
 * Usage:
 *   import { JsonLd } from '@/components/seo/JsonLd';
 *   <JsonLd data={{ "@context": "https://schema.org", "@type": "Organization", ... }} />
 *
 * Server components only — keeps the payload out of the client bundle.
 * Pass `id` when a page emits multiple blocks so React keys stay stable.
 */

type Props = {
  data: Record<string, unknown> | Record<string, unknown>[];
  id?: string;
};

export function JsonLd({ data, id }: Props) {
  // Escape `<` inside string values so an embedded `</script>` can't
  // break out of the tag. JSON.stringify does not do this by default.
  const serialised = JSON.stringify(data).replace(/</g, '\\u003c');
  return (
    <script
      type="application/ld+json"
      id={id}
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: serialised }}
    />
  );
}
