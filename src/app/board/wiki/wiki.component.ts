import { ChangeDetectorRef, Component, Input, OnChanges, SimpleChanges, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Firestore, doc, setDoc } from '@angular/fire/firestore';
import { DEFAULT_TEMPLATES } from './wiki-templates';

export interface WikiSection {
  id: string;
  title: string;
  icon: string;
  content: string;
  updatedAt?: number;
}

@Component({
  selector: 'app-wiki',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './wiki.component.html',
  styleUrls: ['./wiki.component.css']
})
export class WikiComponent implements OnChanges {
  @Input() boardId: string = '';
  @Input() wikiSections: WikiSection[] = []; // Firestoreから受け取る配列

  private firestore = inject(Firestore);
  private cdr = inject(ChangeDetectorRef);

  sections: WikiSection[] = [];
  activeSectionId: string = 'all';

  isEditing: boolean = false;
  editingTitle: string = '';
  editingIcon: string = '📄';
  editingContent: string = '';
  isSaving: boolean = false;
  draggedIndex: number | null = null;
  dragOverIndex: number | null = null;

  presetIcons: string[] = ['📄', '🎯', '📋', '🔗', '🔄', '💡', '🔥', '✅', '🚀', '📌', '🗓️', '📁', '🛠️', '💬', '🎉'];

  ngOnChanges(changes: SimpleChanges) {
    if (changes['wikiSections']) {
      if (this.wikiSections && this.wikiSections.length > 0) {
        this.sections = JSON.parse(JSON.stringify(this.wikiSections));
      } else {
        // データがまだ無い場合は初期テンプレートをセット
        this.initDefaultSections();
      }

      if (!this.activeSectionId && this.sections.length > 0) {
        this.selectSection('all');
      }
    }
  }

  // 初期項目の作成
  initDefaultSections() {
    const now = Date.now();
    this.sections = [
      { id: 'vision', ...DEFAULT_TEMPLATES['vision'], updatedAt: now },
      { id: 'rules', ...DEFAULT_TEMPLATES['rules'], updatedAt: now },
      { id: 'links', ...DEFAULT_TEMPLATES['links'], updatedAt: now }
    ];
  }

  // 選択中のセクション
  get activeSection(): WikiSection | undefined {
    return this.sections.find(s => s.id === this.activeSectionId);
  }

  // 項目切り替え
  selectSection(id: string) {
    if (this.activeSectionId === id) {
      return;
    }

    if (this.isEditing) {
      if (!confirm('編集中の内容は破棄されますが宜しいですか？')) return;
      this.isEditing = false;
    }
    this.activeSectionId = id;
  }

  editSpecificSection(id: string) {
    if (this.isEditing && this.activeSectionId !== id) {
      if (!confirm('編集中の内容は破棄されますが宜しいですか？')) return;
    }

    this.activeSectionId = id;

    const targetSection = this.sections.find(s => s.id === id);
    if (targetSection) {
      this.editingTitle = targetSection.title;
      this.editingIcon = targetSection.icon || '📄';
      this.editingContent = targetSection.content;
      this.isEditing = true;
    }
  }

  onDragStart(index: number) {
    this.draggedIndex = index;
  }

  onDragOver(event: DragEvent, index: number) {
    event.preventDefault(); // ドロップを許可
    this.dragOverIndex = index;
  }

  onDragLeave() {
    this.dragOverIndex = null;
  }

  async onDrop(index: number) {
    if (this.draggedIndex !== null && this.draggedIndex !== index) {
      // 配列の要素を入れ替える
      const movedItem = this.sections[this.draggedIndex];
      this.sections.splice(this.draggedIndex, 1);
      this.sections.splice(index, 0, movedItem);

      // 並び替えた配列をFirestoreに保存
      await this.saveToFirestore();
    }
    this.draggedIndex = null;
    this.dragOverIndex = null;
  }

  onDragEnd() {
    this.draggedIndex = null;
    this.dragOverIndex = null;
  }

  // 新規項目の追加
  async addSection() {
    const newId = 'section_' + Date.now();
    const newSection: WikiSection = {
      id: newId,
      title: '無題の項目',
      icon: '📄',
      content: '',
      updatedAt: Date.now()
    };
    this.sections.push(newSection);
    this.activeSectionId = newId;
    await this.saveToFirestore();
    this.startEdit();
  }

  selectIcon(icon: string) {
    this.editingIcon = icon;
  }

  // 項目の削除
  deleteSection(id: string, event: Event) {
    event.stopPropagation();
    if (this.sections.length <= 1) {
      alert('最低1つの項目は必要です');
      return;
    }
    if (confirm('この項目を削除してもよろしいですか？')) {
      this.sections = this.sections.filter(s => s.id !== id);
      if (this.activeSectionId === id) {
        this.isEditing = false;
        this.activeSectionId = 'all';
      }
      this.saveToFirestore();
    }
  }

  // 編集開始
  startEdit() {
    if (!this.activeSection) return;
    this.editingTitle = this.activeSection.title;
    this.editingIcon = this.activeSection.icon || '📄';
    this.editingContent = this.activeSection.content;
    this.isEditing = true;
  }

  // テンプレートの流し込み
  applyTemplate(templateKey: string) {
    const template = DEFAULT_TEMPLATES[templateKey];
    if (template) {
      this.editingTitle = template.title;
      this.editingIcon = template.icon;
      this.editingContent = template.content;
    }
  }

  cancelEdit() {
    this.isEditing = false;
  }

  // 保存処理
  async saveWiki() {
    if (!this.activeSection) return;

    this.activeSection.title = this.editingTitle.trim() || '無題の項目';
    this.activeSection.icon = this.editingIcon;
    this.activeSection.content = this.editingContent;
    this.activeSection.updatedAt = Date.now();

    await this.saveToFirestore();
    this.isEditing = false;
    this.cdr.detectChanges();
  }

  private async saveToFirestore() {
    if (!this.boardId) return;
    this.isSaving = true;

    try {
      const cleanedSections = JSON.parse(JSON.stringify(this.sections));
      const boardRef = doc(this.firestore, `boards/${this.boardId}`);
      await setDoc(boardRef, { wikiSections: cleanedSections }, { merge: true });
    } catch (err) {
      console.error('Wiki Save Error:', err);
      alert('保存に失敗しました');
    } finally {
      this.isSaving = false;
      this.cdr.detectChanges();
    }
  }
}