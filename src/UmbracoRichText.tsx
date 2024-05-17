import { decode } from "html-entities";
import React from "react";
import type { Overwrite } from "./utils/helper-types";
import { parseStyle } from "./utils/parse-style";

interface BaseBlockItemModel {
  content?: {
    id: string;
    properties: {
      [key: string]: unknown;
    };
  };
  settings?: {
    id: string;
    properties: {
      [key: string]: unknown;
    };
  };
}

/**
 * Override the block item model with Umbraco specific properties.
 * This way you can get the full type safety of the Umbraco API you are using.
 *
 * **react-umbraco.d.ts**
 * ```ts
 * import { components } from '@/openapi/umbraco';
 *
 * // Define the intermediate interface
 * type ApiBlockItemModel = components['schemas']['ApiBlockItemModel'];
 *
 * declare module '@charlietango/react-umbraco' {
 *   interface UmbracoBlockItemModel extends ApiBlockItemModel {}
 * }
 * ```
 */
export type UmbracoBlockItemModel = {};

export type RenderBlockContext = Overwrite<
  BaseBlockItemModel,
  UmbracoBlockItemModel
>;

interface RouteAttributes {
  path: string;
  startItem: {
    id: string;
    path: string;
  };
}

interface NodeMeta {
  /** The tag of the parent element */
  ancestor?: string;
  /** The tag of the previous sibling element */
  previous?: string;
  /** The tag of the next sibling element */
  next?: string;
}

/**
 * Props for rendering a single node in the rich text.
 * A node is any HTML element that is part of the rich text.
 */
export type RenderNodeContext = {
  children?: React.ReactNode;
  meta: NodeMeta;
} & (
  | {
      [Tag in keyof React.JSX.IntrinsicElements]: {
        tag: Tag;
        attributes: React.JSX.IntrinsicElements[Tag];
      };
    }[keyof Omit<React.JSX.IntrinsicElements, "a">]
  | {
      tag: "a";
      attributes: React.JSX.IntrinsicElements["a"];
      /** The route attributes for internal Umbraco links */
      route?: RouteAttributes;
    }
);

interface RichTextProps {
  data:
    | {
        /** List as `string` so it matches generated type from Umbraco. In reality, the value of the root `tag` must be `#root` */
        tag: string;
        attributes?: Record<string, unknown>;
        elements?: RichTextElementModel[];
        blocks?: Array<RenderBlockContext>;
      }
    | undefined;
  renderBlock?: (block: RenderBlockContext) => React.ReactNode;
  /**
   * Render an HTML node with custom logic.
   * @param node
   * @returns A React node, `null` to render nothing, or `undefined` to fallback to the default element
   */
  renderNode?: (node: RenderNodeContext) => React.ReactNode | undefined;
}

export type RichTextElementModel =
  | {
      tag: "#text";
      text: string;
    }
  | {
      tag: "#comment";
      text: string;
    }
  | {
      tag: "umb-rte-block";
      attributes: {
        "content-id": string;
      };
      elements: RichTextElementModel[];
    }
  | {
      tag: keyof React.JSX.IntrinsicElements;
      attributes: Record<string, unknown> & { route?: RouteAttributes };
      elements?: RichTextElementModel[];
    };

/**
 * Render the individual elements of the rich text
 */
function RichTextElement({
  element,
  blocks,
  renderBlock,
  renderNode,
  meta,
}: {
  element: RichTextElementModel;
  blocks: Array<RenderBlockContext> | undefined;
  meta:
    | {
        ancestor?: string;
        next?: string;
        previous?: string;
      }
    | undefined;
} & Pick<RichTextProps, "renderBlock" | "renderNode">) {
  if (!element || element.tag === "#comment") return null;
  if (element.tag === "#text") {
    // Decode HTML entities in text nodes
    return decode(element.text);
  }

  let children = element.elements?.map((node, index) => (
    <RichTextElement
      key={index}
      element={node}
      blocks={blocks}
      renderBlock={renderBlock}
      renderNode={renderNode}
      meta={{
        ancestor: element.tag,
        previous: element.elements?.[index - 1]?.tag,
        next: element.elements?.[index + 1]?.tag,
      }}
    />
  ));
  if (!children?.length) children = undefined;

  // If the tag is a block, skip the normal rendering and render the block
  if (element.tag === "umb-rte-block") {
    const block = blocks?.find(
      (block) => block.content?.id === element.attributes["content-id"],
    );
    if (renderBlock && block) {
      return renderBlock(block);
    }
    if (typeof renderBlock !== "function") {
      throw new Error(
        "No renderBlock function provided for rich text block. Unable to render block.",
      );
    }

    return null;
  }

  const { route, style, class: className, ...attributes } = element.attributes;

  if (element.tag === "a") {
    attributes.href = route?.path;
  }

  if (className) {
    attributes.className = className;
  }

  if (typeof style === "string") {
    attributes.style = parseStyle(style);
  }

  if (renderNode) {
    const output = renderNode({
      // biome-ignore lint/suspicious/noExplicitAny: Avoid complicated TypeScript logic by using `any`. The type will be corrected in the implementation.
      tag: element.tag as any,
      attributes,
      children,
      route,
      meta: meta || {},
    });

    if (output !== undefined) {
      // If we got a valid output from the renderElement function, we return it
      // `null` we will render nothing, but `undefined` fallback to the default element
      return output;
    }
  }

  return React.createElement(
    element.tag,
    attributes as React.Attributes,
    children,
  );
}

/**
 * Component for rendering a rich text component
 */
export function UmbracoRichText(props: RichTextProps) {
  const rootElement = props.data;
  if (rootElement?.tag === "#root" && rootElement.elements) {
    return (
      <>
        {rootElement.elements.map((element, index) => (
          <RichTextElement
            key={index}
            element={element}
            blocks={rootElement.blocks}
            renderBlock={props.renderBlock}
            renderNode={props.renderNode}
            meta={undefined}
          />
        ))}
      </>
    );
  }

  // If the element is not a root element, we return null
  return null;
}
