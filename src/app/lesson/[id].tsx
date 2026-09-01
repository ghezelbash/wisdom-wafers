import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Image, SafeAreaView, useColorScheme } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';

import { mockLessons } from '@/data/mockLessons';
import { WaferCard, TextCard, ImageCard, QuizCard } from '@/models/lesson';

export default function LessonScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { t } = useTranslation();

  const lesson = mockLessons[id || 'mock-id'];
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);

  if (!lesson) {
    return (
      <View className="flex-1 items-center justify-center bg-white dark:bg-black">
        <Text className="text-gray-900 dark:text-white">Lesson not found</Text>
      </View>
    );
  }

  const currentCard = lesson.cards[currentIndex];
  const progress = ((currentIndex + 1) / lesson.cards.length) * 100;

  const handleNext = () => {
    if (currentIndex < lesson.cards.length - 1) {
      setCurrentIndex((prev) => prev + 1);
      setSelectedOption(null);
    } else {
      // Finish lesson
      router.back();
    }
  };

  const handleClose = () => {
    router.back();
  };

  const renderCardContent = (card: WaferCard) => {
    switch (card.type) {
      case 'text':
        return (
          <View className="flex-1 justify-center px-6">
            <Text className="text-2xl font-bold text-gray-900 dark:text-white leading-relaxed text-center">
              {card.content}
            </Text>
          </View>
        );
      case 'image':
        return (
          <View className="flex-1 justify-center px-4">
            <Image 
              source={{ uri: card.imageUrl }} 
              className="w-full h-64 rounded-2xl mb-6 bg-gray-200 dark:bg-gray-800"
              resizeMode="cover"
            />
            {card.caption && (
              <Text className="text-lg text-gray-700 dark:text-gray-300 text-center px-4">
                {card.caption}
              </Text>
            )}
          </View>
        );
      case 'quiz':
        return (
          <View className="flex-1 justify-center px-6">
            <Text className="text-2xl font-bold text-gray-900 dark:text-white mb-8 text-center">
              {card.question}
            </Text>
            
            <View className="gap-4">
              {card.options.map((option) => {
                const isSelected = selectedOption === option.id;
                const showCorrect = selectedOption && option.isCorrect;
                const showIncorrect = isSelected && !option.isCorrect;
                
                let btnClass = "border-[3px] border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 rounded-3xl p-5 shadow-sm";
                let textClass = "text-lg text-gray-800 dark:text-gray-200 text-center font-semibold";

                if (showCorrect) {
                  btnClass = "border-[3px] border-green-500 bg-green-50 dark:bg-green-900/30 rounded-3xl p-5 shadow-sm";
                  textClass = "text-lg text-green-700 dark:text-green-300 font-extrabold text-center";
                } else if (showIncorrect) {
                  btnClass = "border-[3px] border-red-500 bg-red-50 dark:bg-red-900/30 rounded-3xl p-5 shadow-sm";
                  textClass = "text-lg text-red-700 dark:text-red-300 font-extrabold text-center";
                } else if (selectedOption) {
                  btnClass = "border-[3px] border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 opacity-50 rounded-3xl p-5";
                }

                return (
                  <TouchableOpacity
                    key={option.id}
                    className={btnClass}
                    onPress={() => !selectedOption && setSelectedOption(option.id)}
                    disabled={!!selectedOption}
                  >
                    <Text className={textClass}>{option.text}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {selectedOption && (
              <View className="mt-8 p-6 bg-brand-50 dark:bg-brand-900/30 rounded-3xl border border-brand-100 dark:border-brand-800/50">
                <Text className="text-brand-800 dark:text-brand-200 text-center font-semibold text-lg leading-relaxed">
                  {card.explanation}
                </Text>
              </View>
            )}
          </View>
        );
    }
  };

  const isLastCard = currentIndex === lesson.cards.length - 1;
  const isQuizWaiting = currentCard.type === 'quiz' && !selectedOption;
  const colorScheme = useColorScheme();
  const iconColor = colorScheme === 'dark' ? '#6b7280' : '#9ca3af';

  return (
    <SafeAreaView className="flex-1 bg-surface-light dark:bg-surface-dark">
      {/* Top Header & Progress */}
      <View className="px-4 py-4 flex-row items-center gap-4">
        <TouchableOpacity onPress={handleClose} className="p-2 bg-gray-100 dark:bg-gray-800 rounded-full">
          <Ionicons name="close" size={24} color={iconColor} />
        </TouchableOpacity>
        <View className="flex-1 h-3 bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden">
          <View 
            className="h-full bg-brand-500 rounded-full"
            style={{ width: `${progress}%` }}
          />
        </View>
      </View>

      {/* Card Content */}
      <View className="flex-1">
        {renderCardContent(currentCard)}
      </View>

      {/* Bottom Action Area */}
      <View className="p-6">
        <TouchableOpacity 
          className={`w-full py-5 rounded-[32px] items-center shadow-sm ${isQuizWaiting ? 'bg-gray-200 dark:bg-gray-800' : 'bg-brand-500'}`}
          onPress={handleNext}
          disabled={isQuizWaiting}
        >
          <Text className={`text-xl font-bold ${isQuizWaiting ? 'text-gray-400 dark:text-gray-600' : 'text-white'}`}>
            {isLastCard ? t('finish_lesson') : t('continue')}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
