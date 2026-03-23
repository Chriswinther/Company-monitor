import React, { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, View, Text, StyleSheet, Platform } from 'react-native';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { Session } from '@supabase/supabase-js';
import { B } from '../theme';

import FeedScreen from '../screens/FeedScreen';
import SearchScreen from '../screens/SearchScreen';
import WatchlistScreen from '../screens/WatchlistScreen';
import ProfileScreen from '../screens/ProfileScreen';
import CompanyDetailScreen from '../screens/CompanyDetailScreen';
import LoginScreen from '../screens/LoginScreen';
import SignUpScreen from '../screens/SignUpScreen';

export type RootStackParamList = {
  MainTabs: undefined;
  CompanyDetail: {
    cvrNumber?: string; cvr_number?: string; companyName?: string;
    company?: Record<string, unknown>; item?: Record<string, unknown>;
  };
};
export type AuthStackParamList = { Login: undefined; SignUp: undefined; };
export type MainTabParamList = { Feed: undefined; Signals: undefined; Watchlist: undefined; Profile: undefined; };

const Tab = createBottomTabNavigator<MainTabParamList>();
const Stack = createNativeStackNavigator<RootStackParamList>();
const AuthStack = createNativeStackNavigator<AuthStackParamList>();

const BoydenTheme = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, background: B.bg, card: B.headerBg, text: B.textPrimary, border: B.border, primary: B.blue, notification: B.blue },
};

// ─── Animated Tab Icon ────────────────────────────────────────────────────────

interface AnimatedTabIconProps {
  name: keyof typeof Ionicons.glyphMap;
  outlineName: keyof typeof Ionicons.glyphMap;
  color: string;
  focused: boolean;
  label: string;
}

function AnimatedTabIcon({ name, outlineName, color, focused, label }: AnimatedTabIconProps) {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const fillAnim = useRef(new Animated.Value(focused ? 1 : 0)).current;
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    Animated.spring(fillAnim, {
      toValue: focused ? 1 : 0,
      useNativeDriver: false,
      tension: 120,
      friction: 8,
    }).start();
  }, [focused]);

  useEffect(() => {
    Animated.spring(scaleAnim, {
      toValue: hovered && !focused ? 1.15 : focused ? 1.1 : 1,
      useNativeDriver: true,
      tension: 200,
      friction: 10,
    }).start();
  }, [hovered, focused]);

  const bgOpacity = fillAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
  const iconColor = focused ? B.blue : hovered ? B.blueLight : B.tabInactive;

  const hoverHandlers = Platform.OS === 'web'
    ? { onMouseEnter: () => setHovered(true), onMouseLeave: () => setHovered(false) }
    : {};

  return (
    <View style={tabStyles.iconWrap} {...hoverHandlers}>
      <Animated.View style={[tabStyles.iconBg, { opacity: bgOpacity }]} />
      <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
        <Ionicons
          name={focused ? name : hovered ? name : outlineName}
          size={22}
          color={iconColor}
        />
      </Animated.View>
      <Text style={[tabStyles.label, { color: iconColor, fontWeight: focused ? '700' : '500' }]}>
        {label}
      </Text>
    </View>
  );
}

const tabStyles = StyleSheet.create({
  iconWrap: { alignItems: 'center', justifyContent: 'center', paddingTop: 4, gap: 3, minWidth: 60 },
  iconBg: {
    position: 'absolute', top: 0, left: -10, right: -10, bottom: 4,
    backgroundColor: B.blueMuted, borderRadius: B.radiusLg,
  },
  label: { fontSize: 10, letterSpacing: 0.2 },
});

// ─── Tab config ───────────────────────────────────────────────────────────────

const TAB_CONFIG = {
  Feed:      { icon: 'flash' as const,      outline: 'flash-outline' as const,      label: 'Feed' },
  Signals:   { icon: 'trending-up' as const, outline: 'trending-up-outline' as const, label: 'Signals' },
  Watchlist: { icon: 'bookmark' as const,    outline: 'bookmark-outline' as const,    label: 'Watchlist' },
  Profile:   { icon: 'person' as const,      outline: 'person-outline' as const,      label: 'Profile' },
};

// ─── Navigators ───────────────────────────────────────────────────────────────

function AuthNavigator() {
  return (
    <AuthStack.Navigator screenOptions={{ headerStyle: { backgroundColor: B.headerBg }, headerShadowVisible: false, headerTintColor: B.blue, headerTitleStyle: { fontWeight: '700', color: B.textPrimary }, contentStyle: { backgroundColor: B.bg } }}>
      <AuthStack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
      <AuthStack.Screen name="SignUp" component={SignUpScreen} options={{ title: 'Create Account', headerBackTitleVisible: false }} />
    </AuthStack.Navigator>
  );
}

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerStyle: { backgroundColor: B.headerBg },
        headerShadowVisible: true,
        headerTintColor: B.textPrimary,
        headerTitleStyle: { fontWeight: '700', color: B.textPrimary, fontSize: 17 },
        tabBarStyle: {
          backgroundColor: B.tabBg,
          borderTopWidth: 1,
          borderTopColor: B.tabBorder,
          height: 74,
          paddingTop: 4,
          paddingBottom: 10,
          shadowColor: B.blue,
          shadowOpacity: 0.08,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: -3 },
          elevation: 10,
        },
        tabBarShowLabel: false,
        sceneStyle: { backgroundColor: B.bg },
        tabBarIcon: ({ color, focused }) => {
          const config = TAB_CONFIG[route.name as keyof typeof TAB_CONFIG];
          return (
            <AnimatedTabIcon
              name={config.icon}
              outlineName={config.outline}
              color={color}
              focused={focused}
              label={config.label}
            />
          );
        },
      })}
    >
      <Tab.Screen name="Feed" component={FeedScreen} options={{ title: 'Feed' }} />
      <Tab.Screen name="Signals" component={SearchScreen} options={{ title: 'Signals' }} />
      <Tab.Screen name="Watchlist" component={WatchlistScreen} options={{ title: 'Watchlist' }} />
      <Tab.Screen name="Profile" component={ProfileScreen} options={{ title: 'Profile' }} />
    </Tab.Navigator>
  );
}

function AppStack() {
  return (
    <Stack.Navigator screenOptions={{ headerStyle: { backgroundColor: B.headerBg }, headerShadowVisible: true, headerTintColor: B.blue, headerTitleStyle: { fontWeight: '700', color: B.textPrimary, fontSize: 17 }, contentStyle: { backgroundColor: B.bg } }}>
      <Stack.Screen name="MainTabs" component={MainTabs} options={{ headerShown: false }} />
      <Stack.Screen name="CompanyDetail" component={CompanyDetailScreen} options={{ title: 'Company Details', headerBackTitleVisible: false }} />
    </Stack.Navigator>
  );
}

export default function AppNavigator({ session }: { session: Session | null }) {
  return (
    <NavigationContainer theme={BoydenTheme}>
      {session ? <AppStack /> : <AuthNavigator />}
    </NavigationContainer>
  );
}