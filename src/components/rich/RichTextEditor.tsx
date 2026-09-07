import { useEffect } from 'react'
import { useEditor, EditorContent, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import {
  Bold,
  Heading2,
  Italic,
  List,
  ListOrdered,
  Minus,
  Quote,
  Redo2,
  Strikethrough,
  Undo2,
} from 'lucide-react'
import { cn } from '@/components/ui'

/**
 * TipTap 轻量富文本编辑器（执行案 Sprint 2：富文本采用 TipTap 轻量配置）
 * 值以 HTML 存储（与 Character.appearance/background/notes 等字段一致）。
 * 非受控：初始 content 由 value 注入，改动经 onChange 上报。
 * 外部数据变化（AI 生成写入、版本回滚等）会在**编辑器未聚焦且内容不同**时同步进来，
 * 聚焦中不同步，避免打断输入与光标跳动。
 */
export function RichTextEditor({
  value,
  onChange,
  placeholder,
  minHeight = 'min-h-24',
}: {
  value?: string
  onChange: (html: string) => void
  placeholder?: string
  minHeight?: string
}) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Placeholder.configure({ placeholder: placeholder ?? '输入内容…' }),
    ],
    content: value || '',
    editorProps: {
      attributes: {
        class: `prose-editor px-3 py-2 text-sm leading-relaxed outline-none ${minHeight}`,
      },
    },
    onUpdate: ({ editor: e }) => onChange(e.getHTML()),
  })

  // 外部值同步（Sprint 8：AI 写入/版本回滚后立即可见）
  useEffect(() => {
    if (!editor || value === undefined) return
    if (editor.isDestroyed || editor.isFocused) return
    if (editor.getHTML() === value) return
    editor.commands.setContent(value || '', false)
  }, [value, editor])

  return (
    <div className="overflow-hidden rounded-lg border border-stone-300 bg-white transition-colors focus-within:ring-2 focus-within:ring-violet-500/40 focus-within:border-violet-500">
      {editor && <Toolbar editor={editor} />}
      <EditorContent editor={editor} />
    </div>
  )
}

function Toolbar({ editor }: { editor: Editor }) {
  const Btn = ({
    onClick,
    active,
    label,
    children,
  }: {
    onClick: () => void
    active?: boolean
    label: string
    children: React.ReactNode
  }) => (
    <button
      type="button"
      title={label}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn(
        'flex h-7 w-7 items-center justify-center rounded-md text-stone-500 transition-colors cursor-pointer hover:bg-stone-100 hover:text-stone-800',
        active && 'bg-violet-100 text-violet-700',
      )}
    >
      {children}
    </button>
  )

  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b border-stone-100 bg-stone-50 px-2 py-1">
      <Btn
        label="标题"
        active={editor.isActive('heading', { level: 2 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
      >
        <Heading2 className="size-4" />
      </Btn>
      <Btn label="粗体" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}>
        <Bold className="size-4" />
      </Btn>
      <Btn label="斜体" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}>
        <Italic className="size-4" />
      </Btn>
      <Btn label="删除线" active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()}>
        <Strikethrough className="size-4" />
      </Btn>
      <span className="mx-1 h-4 w-px bg-stone-200" />
      <Btn
        label="无序列表"
        active={editor.isActive('bulletList')}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        <List className="size-4" />
      </Btn>
      <Btn
        label="有序列表"
        active={editor.isActive('orderedList')}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        <ListOrdered className="size-4" />
      </Btn>
      <Btn
        label="引用"
        active={editor.isActive('blockquote')}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      >
        <Quote className="size-4" />
      </Btn>
      <Btn label="分割线" onClick={() => editor.chain().focus().setHorizontalRule().run()}>
        <Minus className="size-4" />
      </Btn>
      <span className="mx-1 h-4 w-px bg-stone-200" />
      <Btn label="撤销" onClick={() => editor.chain().focus().undo().run()}>
        <Undo2 className="size-4" />
      </Btn>
      <Btn label="重做" onClick={() => editor.chain().focus().redo().run()}>
        <Redo2 className="size-4" />
      </Btn>
    </div>
  )
}
