// ============================================================
// Syllabus Screen — Subject → Chapter → Task navigation
// ============================================================

import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  StyleSheet, Platform
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useAppStore } from '../../src/store/appStore';
import { cycleTaskStatus, deleteTask, getChapterProgress, getSubjectProgress, refreshSyllabusState } from '../../src/features/syllabus/syllabusService';
import { TaskStatus } from '../../src/events/types';

type SyllabusView = 'subjects' | 'chapters' | 'tasks';

const STATUS_COLORS: Record<TaskStatus, { bg: string; text: string; icon: string }> = {
  NOT_STARTED: { bg: '#1e1e2e', text: '#6b7280', icon: 'radio-button-unchecked' },
  IN_PROGRESS: { bg: '#1e3a5f', text: '#60a5fa', icon: 'timelapse' },
  DONE: { bg: '#064e3b', text: '#34d399', icon: 'check-circle' },
};

export default function SyllabusScreen() {
  const [view, setView] = useState<SyllabusView>('subjects');
  const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(null);
  const [selectedChapterId, setSelectedChapterId] = useState<string | null>(null);

  const { subjects, chapters, tasks } = useAppStore();

  useEffect(() => {
    refreshSyllabusState();
  }, []);

  const filteredChapters = chapters.filter(c => c.subjectId === selectedSubjectId);
  const filteredTasks = tasks.filter(t => t.chapterId === selectedChapterId);

  const selectedSubject = subjects.find(s => s.subjectId === selectedSubjectId);
  const selectedChapter = chapters.find(c => c.chapterId === selectedChapterId);

  return (
    <View style={styles.container}>
      {/* Header with breadcrumbs */}
      <View style={styles.header}>
        <View style={styles.breadcrumbs}>
          <TouchableOpacity onPress={() => setView('subjects')}>
            <Text style={[styles.crumb, view === 'subjects' && styles.crumbActive]}>Subjects</Text>
          </TouchableOpacity>
          {selectedSubjectId && (
            <>
              <MaterialIcons name="chevron-right" size={16} color="#6b7280" />
              <TouchableOpacity onPress={() => setView('chapters')}>
                <Text style={[styles.crumb, view === 'chapters' && styles.crumbActive]} numberOfLines={1}>
                  {selectedSubject?.name}
                </Text>
              </TouchableOpacity>
            </>
          )}
          {selectedChapterId && (
            <>
              <MaterialIcons name="chevron-right" size={16} color="#6b7280" />
              <Text style={[styles.crumb, styles.crumbActive]} numberOfLines={1}>
                {selectedChapter?.name}
              </Text>
            </>
          )}
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.list}>
        {view === 'subjects' && subjects.map((subject) => {
          const prog = getSubjectProgress(subject.subjectId);
          return (
            <TouchableOpacity
              key={subject.subjectId}
              style={styles.card}
              onPress={() => { setSelectedSubjectId(subject.subjectId); setView('chapters'); }}
              activeOpacity={0.8}
            >
              <View style={styles.cardLeft}>
                <View style={styles.subjectIcon}>
                  <MaterialIcons name="menu-book" size={22} color="#7c3aed" />
                </View>
                <View style={styles.cardText}>
                  <Text style={styles.cardTitle}>{subject.name}</Text>
                  <Text style={styles.cardSub}>
                    {chapters.filter(c => c.subjectId === subject.subjectId).length} chapters
                  </Text>
                </View>
              </View>
              <View style={styles.cardRight}>
                <Text style={styles.progressLabel}>{prog}%</Text>
                <View style={styles.progressBar}>
                  <View style={[styles.progressFill, { width: `${prog}%` as any, backgroundColor: prog === 100 ? '#10b981' : '#7c3aed' }]} />
                </View>
                <MaterialIcons name="chevron-right" size={20} color="#6b7280" />
              </View>
            </TouchableOpacity>
          );
        })}

        {view === 'chapters' && filteredChapters.map((chapter) => {
          const prog = getChapterProgress(chapter.chapterId);
          const chapterTasks = tasks.filter(t => t.chapterId === chapter.chapterId);
          const doneTasks = chapterTasks.filter(t => t.status === 'DONE').length;
          return (
            <TouchableOpacity
              key={chapter.chapterId}
              style={styles.card}
              onPress={() => { setSelectedChapterId(chapter.chapterId); setView('tasks'); }}
              activeOpacity={0.8}
            >
              <View style={styles.cardLeft}>
                <View style={[styles.subjectIcon, { backgroundColor: '#1e3a5f' }]}>
                  <MaterialIcons name="article" size={22} color="#60a5fa" />
                </View>
                <View style={styles.cardText}>
                  <Text style={styles.cardTitle}>{chapter.name}</Text>
                  <Text style={styles.cardSub}>{doneTasks}/{chapterTasks.length} tasks done</Text>
                </View>
              </View>
              <View style={styles.cardRight}>
                <Text style={styles.progressLabel}>{prog}%</Text>
                <View style={styles.progressBar}>
                  <View style={[styles.progressFill, { width: `${prog}%` as any, backgroundColor: prog === 100 ? '#10b981' : '#0891b2' }]} />
                </View>
                <MaterialIcons name="chevron-right" size={20} color="#6b7280" />
              </View>
            </TouchableOpacity>
          );
        })}

        {view === 'tasks' && filteredTasks.map((task) => {
          const s = STATUS_COLORS[task.status];
          return (
            <View key={task.taskId} style={[styles.taskCard, { borderColor: s.text + '33' }]}>
              <TouchableOpacity
                style={styles.taskLeft}
                onPress={() => cycleTaskStatus(task.taskId)}
                activeOpacity={0.8}
              >
                <MaterialIcons name={s.icon as any} size={22} color={s.text} />
                <View>
                  <Text style={styles.taskName}>{task.name}</Text>
                  <Text style={[styles.taskStatus, { color: s.text }]}>{task.status.replace('_', ' ')}</Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => deleteTask(task.taskId)} style={styles.deleteBtn}>
                <MaterialIcons name="delete-outline" size={20} color="#4b5563" />
              </TouchableOpacity>
            </View>
          );
        })}

        {view === 'tasks' && filteredTasks.length === 0 && (
          <View style={styles.empty}>
            <MaterialIcons name="check-circle" size={48} color="#10b981" />
            <Text style={styles.emptyText}>No tasks in this chapter</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f1a' },
  header: { paddingTop: Platform.OS === 'ios' ? 60 : 40, paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#1e1e2e' },
  breadcrumbs: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  crumb: { fontSize: 14, color: '#6b7280', fontWeight: '500' },
  crumbActive: { color: '#e2e8f0', fontWeight: '700' },
  list: { padding: 16, gap: 12 },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#13131f', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#1e1e2e' },
  cardLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 14 },
  subjectIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#2e1065', justifyContent: 'center', alignItems: 'center' },
  cardText: { flex: 1 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#e2e8f0' },
  cardSub: { fontSize: 12, color: '#6b7280', marginTop: 3 },
  cardRight: { alignItems: 'flex-end', gap: 6 },
  progressLabel: { fontSize: 13, fontWeight: '700', color: '#9ca3af' },
  progressBar: { width: 80, height: 5, backgroundColor: '#1e1e2e', borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3 },
  taskCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#13131f', borderRadius: 14, padding: 14, borderWidth: 1 },
  taskLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 14 },
  taskName: { fontSize: 14, fontWeight: '600', color: '#e2e8f0' },
  taskStatus: { fontSize: 12, marginTop: 3, textTransform: 'capitalize', fontWeight: '500' },
  deleteBtn: { padding: 6 },
  empty: { alignItems: 'center', gap: 12, paddingTop: 60 },
  emptyText: { fontSize: 16, color: '#4b5563' },
});
