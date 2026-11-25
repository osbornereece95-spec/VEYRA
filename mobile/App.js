import React, { useState, useEffect } from 'react';
import { useWindowDimensions } from 'react-native';
import {
  SafeAreaView,
  StatusBar,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  StyleSheet,
  Alert,
   ActivityIndicator,
  Image,
  Platform,
  Switch,
  Modal,
} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import * as ImagePicker from 'expo-image-picker';
import { File } from 'expo-file-system';

const API_URL = 'https://veyra-api-r8eq.onrender.com';

async function getStoredToken() {
  if (Platform.OS === 'web') {
    return localStorage.getItem('veyra_token');
  }
  return SecureStore.getItemAsync('veyra_token');
}

async function setStoredToken(token) {
  if (Platform.OS === 'web') {
    localStorage.setItem('veyra_token', token);
    return;
  }
  return SecureStore.setItemAsync('veyra_token', token);
}

async function deleteStoredToken() {
  if (Platform.OS === 'web') {
    localStorage.removeItem('veyra_token');
    return;
  }
  return SecureStore.deleteItemAsync('veyra_token');
}


const C = {
  black: '#050505',
  background: '#080808',
  card: '#101010',
  cardLight: '#191919',
  white: '#FFFFFF',
  grey: '#B8B8B8',
  muted: '#777777',
  line: '#303030',
  accent: '#FFFFFF',
};


const tabs = [
  { name: 'Home', symbol: '\u2302' },
  { name: 'Analytics', symbol: '\u25A5' },
  { name: 'Goals', symbol: '\u25CE' },
  { name: 'Events', symbol: '\u2726' },
  { name: 'Profile', symbol: '\u25C9' },
];


const MONTHLY_HOUR_TARGET = 15;
const VALID_DAYS_TARGET = 7;

function SmokeBackground() {
  return (
    <View pointerEvents="none" style={styles.smokeLayer}>
      <View style={styles.smokeCloudOne} />
      <View style={styles.smokeCloudTwo} />
      <View style={styles.smokeCloudThree} />
      <View style={styles.smokeCloudFour} />
      <View style={styles.smokeCloudFive} />
      <View style={styles.smokeCloudSix} />
      <View style={styles.smokeCloudSeven} />
      <View style={styles.smokeCloudEight} />
    </View>
  );
}

async function apiRequest(path, method = 'GET', body = null, token = null) {
  const headers = { 'Content-Type': 'application/json' };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.detail || 'Something went wrong. Please try again.');
  }

  return data;
}

function getProfileImageUrl(profilePicture) {
  if (!profilePicture) return null;
  if (profilePicture.startsWith('http')) return profilePicture;

  return `${API_URL}/profile-pictures/${encodeURIComponent(profilePicture)}`;
}

function formatMetric(value) {
  if (value === null || value === undefined || value === '') return '\u2014';

  const number = Number(value);

  if (!Number.isFinite(number)) return String(value);

  return number.toLocaleString('en-GB', {
    maximumFractionDigits: 2,
  });
}

// Handles alternative backend field names for Fan Club Fans.
function getFanClubFans(performance) {
  if (!performance) return null;

  const possibleKeys = [
    'active_fans_fan_club_l30d',
    'active_fan_club_fans_l30d',
    'fan_club_active_fans_l30d',
    'active_fan_club_fans',
    'fan_club_fans',
    'active_fans',
  ];

  for (const key of possibleKeys) {
    const value = performance[key];

    if (value !== null && value !== undefined && value !== '') {
      return value;
    }
  }

  return null;
}

// Handles alternative backend field names for Fan Club Diamonds.
function getFanClubDiamonds(performance) {
  if (!performance) return null;

  const possibleKeys = [
    'fan_club_diamonds_l30d',
    'fan_club_diamonds',
    'fanclub_diamonds_l30d',
    'fan_club_gift_diamonds_l30d',
    'fan_club_diamonds_last_30_days',
  ];

  for (const key of possibleKeys) {
    const value = performance[key];

    if (value !== null && value !== undefined && value !== '') {
      return value;
    }
  }

  return null;
}

function getProgress(value, target) {
  const number = Number(value);

  if (!Number.isFinite(number) || number < 0 || !target) return 0;

  return Math.min((number / target) * 100, 100);
}

function Button({ title, onPress, secondary = false, disabled = false }) {
  return (
    <TouchableOpacity
      style={[
        styles.button,
        secondary && styles.secondaryButton,
        disabled && { opacity: 0.5 },
      ]}
      onPress={onPress}
      activeOpacity={0.8}
      disabled={disabled}
    >
      <Text style={[
        styles.buttonText,
        secondary && styles.secondaryButtonText,
      ]}>
        {title}
      </Text>
    </TouchableOpacity>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  keyboardType,
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#777777"
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType || 'default'}
        autoCapitalize="none"
      />
    </View>
  );
}


function AuthScreen({ onRegister, loading }) {
  const [inviteCode, setInviteCode] = useState('');
  const [username, setUsername] = useState('');

  function submitActivation() {
    if (!username.trim() || !inviteCode.trim()) {
      Alert.alert(
        'Missing details',
        'Enter your TikTok username and invitation code.'
      );
      return;
    }

    onRegister(username.trim(), inviteCode.trim());
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={C.black} />
      <SmokeBackground />

      <ScrollView contentContainerStyle={styles.authContainer}>
        

        <View style={styles.authHeading}>
          <Text style={styles.authEyebrow}>EXCLUSIVE CREATOR ACCESS</Text>
          <Text style={styles.authTitle}>Your next chapter.</Text>
          <Text style={styles.muted}>
            Activate your invited VEYRA creator account.
          </Text>
        </View>

        <Field
          label="TIKTOK USERNAME"
          value={username}
          onChangeText={setUsername}
          placeholder="@yourusername"
          autoCapitalize="none"
        />

        <Field
          label="INVITATION CODE"
          value={inviteCode}
          onChangeText={setInviteCode}
          placeholder="Enter your invitation code"
          autoCapitalize="none"
        />

        <Button
          title={loading ? 'PLEASE WAIT...' : 'ACTIVATE ACCOUNT'}
          onPress={submitActivation}
          disabled={loading}
        />

        <Text style={styles.authFooter}>
          PRIVATE NETWORK Â· TIKTOK LIVE CREATORS
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Avatar({ profilePicture, displayName, size = 'small' }) {
  const imageUrl = getProfileImageUrl(profilePicture);
  const large = size === 'large';

  if (imageUrl) {
    return (
      <Image
        source={{ uri: imageUrl }}
        style={large ? styles.avatarLarge : styles.avatarSmall}
      />
    );
  }

  const initial = (displayName || 'V').trim().charAt(0).toUpperCase() || 'V';

  return (
    <View style={large ? styles.avatarLarge : styles.avatarSmall}>
      <Text style={styles.avatarLetter}>{initial}</Text>
    </View>
  );
}

function Header({ subtitle, user }) {
  return (
    <View style={styles.header}>
      <View>
        <Text style={styles.logoSmall}>VEYRA.</Text>
        <Text style={styles.headerSubtitle}>{subtitle}</Text>
      </View>

      <View style={styles.headerRight}>
        <View style={styles.onlineDot} />
        <Avatar
          profilePicture={user?.profile_picture}
          displayName={user?.display_name || user?.username}
        />
      </View>
    </View>
  );
}

function SectionHeading({ title, action, onAction }) {
  return (
    <View style={styles.sectionHeading}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {action ? (
        <TouchableOpacity onPress={onAction}>
          <Text style={styles.sectionAction}>{action}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function MetricCard({ label, value, detail }) {
  return (
    <View style={styles.metricCard}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
      {detail ? <Text style={styles.metricDetail}>{detail}</Text> : null}
    </View>
  );
}

function ProgressBar({ percentage }) {
  return (
    <View style={styles.progressTrack}>
      <View
        style={[
          styles.progressFill,
          { width: `${percentage}%` },
        ]}
      />
    </View>
  );
}

function PerformanceMessage({ loading, error, performance }) {
  if (loading) {
    return (
      <View style={styles.messageCard}>
        <ActivityIndicator color={C.white} size="small" />
        <Text style={styles.muted}>Updating your performance...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.messageCard}>
        <Text style={styles.messageTitle}>Performance unavailable</Text>
        <Text style={styles.muted}>{error}</Text>
      </View>
    );
  }

  if (!performance) {
    return (
      <View style={styles.messageCard}>
        <Text style={styles.messageTitle}>Your stats are on their way</Text>
        <Text style={styles.muted}>
          Your Backstage statistics will appear here once your account is
          matched with an imported report.
        </Text>
      </View>
    );
  }

  return null;
}

function TargetCard({ title, value, target, unit, description }) {
  const progress = getProgress(value, target);
  const complete =
    value !== null &&
    value !== undefined &&
    Number(value) >= target;

  return (
    <View style={styles.targetCard}>
      <View style={styles.targetTop}>
        <View style={styles.targetIcon}>
          <Text style={styles.targetIconText}>{'\u25CE'}</Text>
        </View>
        <Text style={styles.targetLabel}>{title}</Text>
        <View style={styles.targetStatus}>
          <Text style={styles.targetStatusText}>
            {complete ? 'DONE' : 'ACTIVE'}
          </Text>
        </View>
      </View>

      <View style={styles.targetNumbers}>
        <Text style={styles.targetNumber}>{formatMetric(value)}</Text>
        <Text style={styles.targetOf}> / {target} {unit}</Text>
      </View>

      <ProgressBar percentage={progress} />

      <View style={styles.targetBottom}>
        <Text style={styles.targetDescription}>{description}</Text>
        <Text style={styles.targetPercent}>{Math.round(progress)}%</Text>
      </View>
    </View>
  );
}

function HomeScreen({
  refreshing,
  onRefresh,
  performance,
  performanceLoading,
  performanceError,
  user,
  goTo,
}) {
  const displayName = user?.display_name || user?.username || 'Creator';
  const liveHours = performance?.live_duration_l30d;

  return (
    <ScrollView
      refreshControl={Platform.OS === 'web' ? undefined : <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.white} colors={[C.white]} progressBackgroundColor={C.card} />}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.screenContent}
    >
      <Header subtitle="CREATOR DASHBOARD" user={user} />

      <View style={styles.welcomeRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>YOUR CREATOR SPACE</Text>
          <Text style={styles.welcomeTitle}>Welcome back,</Text>
          <Text style={styles.welcomeName}>{displayName}.</Text>
        </View>
        <View style={styles.memberBadge}>
          <Text style={styles.memberBadgeText}>VEYRA</Text>
          <Text style={styles.memberBadgeSub}>MEMBER</Text>
        </View>
      </View>

      <View style={styles.heroCard}>
        <View style={styles.heroTop}>
          <Text style={styles.heroEyebrow}>YOUR LAST 30 DAYS</Text>
          <View style={styles.livePill}>
            <View style={styles.livePillDot} />
            <Text style={styles.livePillText}>PERFORMANCE</Text>
          </View>
        </View>

        <Text style={styles.heroLabel}>Total diamonds</Text>
        <Text style={styles.heroNumber}>
          {formatMetric(performance?.diamonds_l30d)}
        </Text>

        <View style={styles.heroDivider} />

        <View style={styles.heroFooter}>
          <View>
            <Text style={styles.heroFooterLabel}>LIVE DURATION</Text>
            <Text style={styles.heroFooterValue}>
              {formatMetric(liveHours)} hours
            </Text>
          </View>
          <View style={styles.heroArrow}>
            <Text style={styles.heroArrowText}>{'\u2197'}</Text>
          </View>
        </View>
      </View>

      <PerformanceMessage
        loading={performanceLoading}
        error={performanceError}
        performance={performance}
      />

      <SectionHeading
        title="PERFORMANCE OVERVIEW"
        action="VIEW ALL"
        onAction={() => goTo('Analytics')}
      />

      <View style={styles.metricsGrid}>
        <MetricCard
          label="FOLLOWERS"
          value={formatMetric(performance?.followers)}
          detail="Total audience"
        />
        <MetricCard
          label="LIKES"
          value={formatMetric(performance?.likes)}
          detail="Total likes"
        />
        <MetricCard
          label="VALID LIVE DAYS"
          value={formatMetric(performance?.valid_live_days_l30d)}
          detail="Last 30 days"
        />
        <MetricCard
          label="LIVE HOURS"
          value={formatMetric(liveHours)}
          detail="Last 30 days"
        />
        <MetricCard
          label="ACTIVE FAN CLUB FANS"
          value={formatMetric(getFanClubFans(performance))}
          detail="Last 30 days"
        />
      </View>

      <SectionHeading title="CREATOR STATUS" />
      <View style={styles.infoCard}>
        <View style={styles.comingSoonRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.infoTitle}>Current tier</Text>
            <Text style={styles.readOnlyValue}>
              {performance?.tier_status || '\u2014'}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.infoTitle}>Previous tier</Text>
            <Text style={styles.readOnlyValue}>
              {performance?.tier_last_month || '\u2014'}
            </Text>
          </View>
        </View>
        <View style={styles.heroDivider} />
        <Text style={styles.infoTitle}>Star Creator achievement</Text>
        <Text style={styles.readOnlyValue}>
          {performance?.achieved_star_creator ? 'Achieved' : 'Not achieved / no data'}
        </Text>
        <Text style={styles.muted}>
          {formatMetric(performance?.star_creator_days_this_month)} Star Creator days this month
        </Text>
      </View>

      <SectionHeading
        title="YOUR MONTHLY GOALS"
        action="VIEW GOALS"
        onAction={() => goTo('Goals')}
      />

      <TargetCard
        title="LIVE HOURS"
        value={liveHours}
        target={MONTHLY_HOUR_TARGET}
        unit="hours"
        description="Monthly LIVE target"
      />

      <TargetCard
        title="VALID LIVE DAYS"
        value={performance?.valid_live_days_l30d}
        target={VALID_DAYS_TARGET}
        unit="days"
        description="Monthly consistency target"
      />

      <SectionHeading title="YOUR VEYRA NETWORK" />

      <TouchableOpacity
        style={styles.networkCard}
        onPress={() => goTo('Events')}
        activeOpacity={0.85}
      >
        <View style={styles.networkIcon}>
          <Text style={styles.networkIconText}>{'\u2726'}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.networkTitle}>Opportunities await.</Text>
          <Text style={styles.networkDescription}>
            Explore creator events, campaigns and announcements.
          </Text>
        </View>
        <Text style={styles.networkArrow}>{'\u203A'}</Text>
      </TouchableOpacity>

      <View style={styles.bottomSpace} />
    </ScrollView>
  );
}

function AnalyticsScreen({
  refreshing,
  onRefresh,
  performance,
  performanceLoading,
  performanceError,
  user,
}) {
  return (
    <ScrollView
      refreshControl={Platform.OS === 'web' ? undefined : <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.white} colors={[C.white]} progressBackgroundColor={C.card} />}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.screenContent}
    >
      <Header subtitle="YOUR PERFORMANCE" user={user} />

      <Text style={styles.eyebrow}>DATA & INSIGHTS</Text>
      <Text style={styles.pageTitle}>Analytics</Text>
      <Text style={styles.pageSubtitle}>
        Understand your growth and LIVE performance.
      </Text>

      <PerformanceMessage
        loading={performanceLoading}
        error={performanceError}
        performance={performance}
      />

      <View style={styles.analyticsHero}>
        <Text style={styles.heroEyebrow}>DIAMONDS {'\u00B7'} LAST 30 DAYS</Text>
        <Text style={styles.analyticsHeroNumber}>
          {formatMetric(performance?.diamonds_l30d)}
        </Text>
        <Text style={styles.analyticsHeroCaption}>
          Your latest reported diamond total
        </Text>
      </View>

      <SectionHeading title="YOUR STATISTICS" />

      <View style={styles.metricsGrid}>
        <MetricCard
          label="FOLLOWERS"
          value={formatMetric(performance?.followers)}
          detail="Audience"
        />
        <MetricCard
          label="LIKES"
          value={formatMetric(performance?.likes)}
          detail="Engagement"
        />
        <MetricCard
          label="LIVE DURATION"
          value={formatMetric(performance?.live_duration_l30d)}
          detail="Last 30 days"
        />
        <MetricCard
          label="VALID LIVE DAYS"
          value={formatMetric(performance?.valid_live_days_l30d)}
          detail="Last 30 days"
        />
        <MetricCard
          label="VIDEOS"
          value={formatMetric(performance?.videos)}
          detail="Total published"
        />
        <MetricCard
          label="FAN CLUB DIAMONDS"
          value={formatMetric(getFanClubDiamonds(performance))}
          detail="Last 30 days"
        />
        <MetricCard
          label="ACTIVE FAN CLUB FANS"
          value={formatMetric(getFanClubFans(performance))}
          detail="Last 30 days"
        />
      </View>

      <SectionHeading title="CREATOR STATUS" />
      <View style={styles.infoCard}>
        <View style={styles.comingSoonRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.infoTitle}>Current tier</Text>
            <Text style={styles.readOnlyValue}>
              {performance?.tier_status || '\u2014'}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.infoTitle}>Previous tier</Text>
            <Text style={styles.readOnlyValue}>
              {performance?.tier_last_month || '\u2014'}
            </Text>
          </View>
        </View>
        <View style={styles.heroDivider} />
        <Text style={styles.infoTitle}>Star Creator achievement</Text>
        <Text style={styles.readOnlyValue}>
          {performance?.achieved_star_creator ? 'Achieved' : 'Not achieved / no data'}
        </Text>
        <Text style={styles.muted}>
          {formatMetric(performance?.star_creator_days_this_month)} Star Creator days this month
        </Text>
      </View>

      <SectionHeading title="REPORTING PERIOD" />

      <View style={styles.infoCard}>
        <Text style={styles.infoTitle}>Last 30 days</Text>
        <Text style={styles.muted}>
          These figures are supplied from your latest imported TikTok
          Backstage report.
        </Text>
      </View>

      <View style={styles.infoCard}>
        <Text style={styles.infoTitle}>Performance history</Text>
        <Text style={styles.muted}>
          Historical charts and period comparisons can be added once
          historical report data is available.
        </Text>
      </View>

      <View style={styles.bottomSpace} />
    </ScrollView>
  );
}

function GoalsScreen({
  refreshing,
  onRefresh,
  performance,
  performanceLoading,
  performanceError,
  user,
}) {
  return (
    <ScrollView
      refreshControl={Platform.OS === 'web' ? undefined : <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.white} colors={[C.white]} progressBackgroundColor={C.card} />}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.screenContent}
    >
      <Header subtitle="YOUR AMBITIONS" user={user} />

      <Text style={styles.eyebrow}>PLAN YOUR PROGRESS</Text>
      <Text style={styles.pageTitle}>Goals</Text>
      <Text style={styles.pageSubtitle}>
        Consistency creates momentum. Track your targets here.
      </Text>

      <PerformanceMessage
        loading={performanceLoading}
        error={performanceError}
        performance={performance}
      />

      <View style={styles.goalSummary}>
        <Text style={styles.heroEyebrow}>YOUR MONTHLY FOCUS</Text>
        <Text style={styles.goalSummaryTitle}>Show up. Stay consistent.</Text>
        <Text style={styles.goalSummaryText}>
          Your targets are measured against your latest 30-day report.
        </Text>
      </View>

      <SectionHeading title="YOUR LIVE TARGETS" />

      <TargetCard
        title="LIVE HOURS"
        value={performance?.live_duration_l30d}
        target={MONTHLY_HOUR_TARGET}
        unit="hours"
        description="15 hours in the last 30 days"
      />

      <TargetCard
        title="VALID LIVE DAYS"
        value={performance?.valid_live_days_l30d}
        target={VALID_DAYS_TARGET}
        unit="days"
        description="7 valid days in the last 30 days"
      />

      <View style={styles.infoCard}>
        <Text style={styles.infoTitle}>Keep building your consistency.</Text>
        <Text style={styles.muted}>
          Your progress updates when a new Backstage report is imported
          and matched to your account.
        </Text>
      </View>

      <View style={styles.bottomSpace} />
    </ScrollView>
  );
}

function EventsScreen({
  refreshing,
  onRefresh, user, campaigns, campaignsLoading, campaignsError, challenges, challengesLoading, challengesError, announcements, announcementsLoading, announcementsError }) {
  return (
    <ScrollView
      refreshControl={Platform.OS === 'web' ? undefined : <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.white} colors={[C.white]} progressBackgroundColor={C.card} />}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.screenContent}
    >
      <Header subtitle="WHAT'S HAPPENING" user={user} />

      <Text style={styles.eyebrow}>INSIDE THE NETWORK</Text>
      <Text style={styles.pageTitle}>Events</Text>
      <Text style={styles.pageSubtitle}>
        Discover opportunities and updates from VEYRA.
      </Text>

      <View style={styles.eventFeature}>
        <Text style={styles.eventFeatureEyebrow}>VEYRA CREATOR NETWORK</Text>
        <Text style={styles.eventFeatureTitle}>Your next opportunity starts here.</Text>
        <Text style={styles.eventFeatureText}>
          Keep an eye on this space for creator campaigns, LIVE challenges,
          competitions and network announcements.
        </Text>
        <View style={styles.eventFeatureMark}>
          <Text style={styles.eventFeatureMarkText}>V.</Text>
        </View>
      </View>

      <SectionHeading title="YOUR OPPORTUNITIES" />

      <View style={styles.comingSoonRow}>
        <Text style={styles.infoTitle}>CAMPAIGNS</Text>
        <Text style={styles.muted}>
          {campaigns.length} {campaigns.length === 1 ? 'CAMPAIGN' : 'CAMPAIGNS'}
        </Text>
      </View>

      {campaignsLoading ? (
        <View style={styles.infoCard}>
          <ActivityIndicator color={C.white} size="small" />
          <Text style={styles.muted}>Loading campaigns...</Text>
        </View>
      ) : campaignsError ? (
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>Campaigns unavailable</Text>
          <Text style={styles.muted}>{campaignsError}</Text>
        </View>
      ) : campaigns.length === 0 ? (
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>No campaigns yet</Text>
          <Text style={styles.muted}>
            Creator campaigns and network opportunities will appear here when they are published.
          </Text>
        </View>
      ) : (
        campaigns.map((campaign) => (
          <View style={styles.infoCard} key={String(campaign.id)}>
            <View style={styles.comingSoonRow}>
              <Text style={styles.infoTitle}>
                {campaign.name || 'Untitled campaign'}
              </Text>
              <Text style={styles.comingSoon}>
                {(campaign.display_status || 'UNKNOWN').toUpperCase()}
              </Text>
            </View>
            {!!campaign.campaign_type && (
              <Text style={styles.muted}>{campaign.campaign_type}</Text>
            )}
            {(campaign.start_date || campaign.end_date) && (
              <Text style={styles.muted}>
                {campaign.start_date ? String(campaign.start_date).slice(0, 10) : 'Date TBC'}
                {'  ?  '}
                {campaign.end_date ? String(campaign.end_date).slice(0, 10) : 'Date TBC'}
              </Text>
            )}
          </View>
        ))
      )}

      <View style={styles.comingSoonRow}>
        <Text style={styles.infoTitle}>LIVE CHALLENGES</Text>
        <Text style={styles.muted}>
          {challenges.length} {challenges.length === 1 ? 'CHALLENGE' : 'CHALLENGES'}
        </Text>
      </View>

      {challengesLoading ? (
        <View style={styles.infoCard}>
          <ActivityIndicator color={C.white} size="small" />
          <Text style={styles.muted}>Loading live challenges...</Text>
        </View>
      ) : challengesError ? (
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>Live challenges unavailable</Text>
          <Text style={styles.muted}>{challengesError}</Text>
        </View>
      ) : challenges.length === 0 ? (
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>No live challenges yet</Text>
          <Text style={styles.muted}>
            Published challenges and creator competitions will appear here.
          </Text>
        </View>
      ) : (
        challenges.map((challenge) => (
          <View style={styles.infoCard} key={String(challenge.id)}>
            <View style={styles.comingSoonRow}>
              <Text style={styles.infoTitle}>
                {challenge.title || 'Untitled challenge'}
              </Text>
              <Text style={styles.comingSoon}>
                {(challenge.display_status || 'published').toUpperCase()}
              </Text>
            </View>
            {!!challenge.description && (
              <Text style={styles.muted}>{challenge.description}</Text>
            )}
            {!!challenge.instructions && (
              <>
                <Text style={styles.infoTitle}>HOW TO TAKE PART</Text>
                <Text style={styles.muted}>{challenge.instructions}</Text>
              </>
            )}
            {!!challenge.reward && (
              <>
                <Text style={styles.infoTitle}>REWARD</Text>
                <Text style={styles.muted}>{challenge.reward}</Text>
              </>
            )}
            {(challenge.start_date || challenge.end_date) && (
              <Text style={styles.muted}>
                {challenge.start_date ? String(challenge.start_date).slice(0, 10) : 'Start date TBC'}
                {'  -  '}
                {challenge.end_date ? String(challenge.end_date).slice(0, 10) : 'No end date'}
              </Text>
            )}
          </View>
        ))
      )}

      <View style={styles.comingSoonRow}>
        <Text style={styles.infoTitle}>ANNOUNCEMENTS</Text>
        <Text style={styles.muted}>
          {announcements.length} {announcements.length === 1 ? 'UPDATE' : 'UPDATES'}
        </Text>
      </View>

      {announcementsLoading ? (
        <View style={styles.infoCard}>
          <ActivityIndicator color={C.white} size="small" />
          <Text style={styles.muted}>Loading announcements...</Text>
        </View>
      ) : announcementsError ? (
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>Announcements unavailable</Text>
          <Text style={styles.muted}>{announcementsError}</Text>
        </View>
      ) : announcements.length === 0 ? (
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>No announcements yet</Text>
          <Text style={styles.muted}>
            Important news and updates from your network will appear here.
          </Text>
        </View>
      ) : (
        announcements.map((announcement) => (
          <View
            key={String(announcement.id)}
            style={styles.infoCard}
          >
            <Text style={styles.infoTitle}>{announcement.title}</Text>
            <Text style={styles.muted}>{announcement.message}</Text>
            {announcement.published_at ? (
              <Text style={styles.muted}>
                {new Date(announcement.published_at).toLocaleDateString()}
              </Text>
            ) : null}
          </View>
        ))
      )}

      <View style={styles.bottomSpace} />
    </ScrollView>
  );
}

function ProfileScreen({
  refreshing,
  onRefresh,
  email,
  username,
  displayName,
  profilePicture,
  onSave,
  onUploadPicture,
  onLogout,
  notificationPreferences,
  notificationSubscribed,
  notificationBusy,
  notificationError,
  onEnableNotifications,
  onToggleNotification,
}) {
  const [newDisplayName, setNewDisplayName] = useState(
    displayName || username || ''
  );
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    setNewDisplayName(displayName || username || '');
  }, [displayName, username]);

  async function choosePicture() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      Alert.alert(
        'Permission needed',
        'Please allow VEYRA to access your photo library.'
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (result.canceled || !result.assets?.length) return;

    setUploading(true);

    try {
      await onUploadPicture(result.assets[0]);
      Alert.alert('Profile picture updated', 'Your new picture has been saved.');
    } catch (error) {
      Alert.alert('Upload failed', error.message);
    } finally {
      setUploading(false);
    }
  }

  async function saveProfile() {
    const trimmedDisplayName = newDisplayName.trim();

    if (!trimmedDisplayName) {
      Alert.alert('Missing display name', 'Please enter a display name.');
      return;
    }

    setSaving(true);

    try {
      await onSave(trimmedDisplayName);
      Alert.alert('Profile updated', 'Your display name has been saved.');
    } catch (error) {
      Alert.alert('Update failed', error.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView
      refreshControl={Platform.OS === 'web' ? undefined : <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.white} colors={[C.white]} progressBackgroundColor={C.card} />}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.screenContent}
    >
      <Header
        subtitle="YOUR ACCOUNT"
        user={{
          username,
          display_name: displayName,
          profile_picture: profilePicture,
        }}
      />

      <Text style={styles.eyebrow}>ACCOUNT SETTINGS</Text>
      <Text style={styles.pageTitle}>Profile</Text>
      <Text style={styles.pageSubtitle}>
        Manage your VEYRA creator profile.
      </Text>

      <View style={styles.profileCard}>
        <Avatar
          profilePicture={profilePicture}
          displayName={displayName || username}
          size="large"
        />

        <Text style={styles.profileName}>
          {displayName || username || 'VEYRA Creator'}
        </Text>

        <Text style={styles.profileEmail}>{email}</Text>

        <TouchableOpacity
          style={styles.photoButton}
          onPress={choosePicture}
          disabled={uploading}
        >
          <Text style={styles.photoButtonText}>
            {uploading ? 'UPLOADING...' : 'CHANGE PROFILE PICTURE'}
          </Text>
        </TouchableOpacity>
      </View>

      <SectionHeading title="PERSONAL DETAILS" />

      <View style={styles.infoCard}>
        <Field
          label="DISPLAY NAME"
          value={newDisplayName}
          onChangeText={setNewDisplayName}
          placeholder="Your display name"
        />

        <View style={styles.readOnlyField}>
          <Text style={styles.fieldLabel}>TIKTOK USERNAME</Text>
          <Text style={styles.readOnlyValue}>
            {username ? `@${username.replace(/^@/, '')}` : 'Not set'}
          </Text>
          <Text style={styles.readOnlyHint}>
            Your TikTok username is managed by VEYRA administration.
          </Text>
        </View>

        <Button
          title={saving ? 'SAVING...' : 'SAVE DISPLAY NAME'}
          onPress={saveProfile}
          disabled={saving}
        />
      </View>

      
      <SectionHeading title="NOTIFICATIONS" />

      <View style={styles.infoCard}>
        <Text style={{ color: C.white, fontSize: 14, fontWeight: '700', marginBottom: 7 }}>
          Push notifications
        </Text>
        <Text style={{ color: C.muted, fontSize: 12, lineHeight: 19, marginBottom: 13 }}>
          Receive important VEYRA updates on this device. You can choose which updates you receive below.
        </Text>

        {notificationSubscribed ? (
          <Text style={{ color: '#8DD6A5', fontSize: 12, marginBottom: 13 }}>
            Notifications are enabled on this device.
          </Text>
        ) : (
          <Button
            title={notificationBusy ? 'PLEASE WAIT...' : 'ENABLE NOTIFICATIONS'}
            onPress={onEnableNotifications}
            disabled={notificationBusy}
          />
        )}

        {notificationError ? (
          <Text style={{ color: '#F0A0A0', fontSize: 12, lineHeight: 18, marginTop: 10 }}>
            {notificationError}
          </Text>
        ) : null}

        {[
          ['campaigns', 'Campaigns', 'New campaign assignments and opportunities'],
          ['announcements', 'Announcements', 'News and updates from VEYRA'],
          ['reminders', 'Reminders', 'Important reminders and deadlines'],
          ['account', 'Account', 'Important account-related updates'],
        ].map(([key, label, description]) => (
          <View
            key={key}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingVertical: 12,
              borderTopWidth: 1,
              borderTopColor: 'rgba(255,255,255,0.09)',
            }}
          >
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={{ color: C.white, fontSize: 13, fontWeight: '600' }}>
                {label}
              </Text>
              <Text style={{ color: C.muted, fontSize: 11, marginTop: 4 }}>
                {description}
              </Text>
            </View>
            <Switch
              value={notificationPreferences[key] !== false}
              onValueChange={(value) => onToggleNotification(key, value)}
              disabled={notificationBusy}
              trackColor={{ false: '#555555', true: '#8DD6A5' }}
              thumbColor="#FFFFFF"
            />
          </View>
        ))}
      </View>

      <Button title="SIGN OUT" secondary onPress={onLogout} />

      <Text style={styles.authFooter}>
        VEYRA CREATOR NETWORK {'\u00B7'} VERSION 1.1
      </Text>

      <View style={styles.bottomSpace} />
    </ScrollView>
  );
}

export default function App() {
  const { width: windowWidth, height: windowHeight, fontScale } = useWindowDimensions();
  const responsiveScale = Math.min(Math.max(windowWidth / 390, 0.95), 1.2);
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState('Home');
  const [loading, setLoading] = useState(true);
  const [authLoading, setAuthLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [performance, setPerformance] = useState(null);
  const [performanceLoading, setPerformanceLoading] = useState(false);
  const [performanceError, setPerformanceError] = useState('');
  const [campaigns, setCampaigns] = useState([]);
  const [campaignsLoading, setCampaignsLoading] = useState(false);
  const [campaignsError, setCampaignsError] = useState('');
  const [challenges, setChallenges] = useState([]);
  const [challengesLoading, setChallengesLoading] = useState(false);
  const [challengesError, setChallengesError] = useState('');
  const [announcements, setAnnouncements] = useState([]);
  const [announcementsLoading, setAnnouncementsLoading] = useState(false);
  const [announcementsError, setAnnouncementsError] = useState('');

  const [notificationPreferences, setNotificationPreferences] = useState({
    campaigns: true,
    announcements: true,
    reminders: true,
    account: true,
  });
  const [notificationSubscribed, setNotificationSubscribed] = useState(false);
  const [notificationBusy, setNotificationBusy] = useState(false);
  const [notificationError, setNotificationError] = useState('');
  const [notificationPromptVisible, setNotificationPromptVisible] = useState(false);
  const [notificationPromptMessage, setNotificationPromptMessage] = useState('');

  useEffect(() => {
    async function restoreSession() {
      try {
        const token = await getStoredToken();

        if (token) {
          const profile = await apiRequest('/me', 'GET', null, token);
          setUser(profile);
        }
      } catch (error) {
        await deleteStoredToken();
      } finally {
        setLoading(false);
      }
    }

    restoreSession();
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadCampaigns() {
      if (!user) {
        setCampaigns([]);
        setCampaignsError('');
        setCampaignsLoading(false);
        return;
      }

      setCampaignsLoading(true);
      setCampaignsError('');

      try {
        const token = await getStoredToken();

        if (!token) {
          throw new Error('Please sign in again to load campaigns.');
        }

        const result = await apiRequest('/campaigns', 'GET', null, token);

        if (!cancelled) {
          setCampaigns(
            Array.isArray(result.campaigns) ? result.campaigns : []
          );
        }
      } catch (error) {
        if (!cancelled) {
          setCampaigns([]);
          setCampaignsError(error.message);
        }
      } finally {
        if (!cancelled) {
          setCampaignsLoading(false);
        }
      }
    }

    loadCampaigns();

    return () => {
      cancelled = true;
    };
  }, [user]);
  useEffect(() => {
    let cancelled = false;

    async function loadChallenges() {
      if (!user) {
        setChallenges([]);
        setChallengesError('');
        setChallengesLoading(false);
        return;
      }

      setChallengesLoading(true);
      setChallengesError('');

      try {
        const token = await getStoredToken();

        if (!token) {
          throw new Error('Please sign in again to load live challenges.');
        }

        const result = await apiRequest('/live-challenges', 'GET', null, token);

        if (!cancelled) {
          setChallenges(Array.isArray(result.challenges) ? result.challenges : []);
        }
      } catch (error) {
        if (!cancelled) {
          setChallenges([]);
          setChallengesError(error?.message || 'Unable to load live challenges.');
        }
      } finally {
        if (!cancelled) {
          setChallengesLoading(false);
        }
      }
    }

    loadChallenges();

    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    let cancelled = false;

    async function loadAnnouncements() {
      if (!user) {
        setAnnouncements([]);
        setAnnouncementsError('');
        setAnnouncementsLoading(false);
        return;
      }

      setAnnouncementsLoading(true);
      setAnnouncementsError('');

      try {
        const token = await getStoredToken();

        if (!token) {
          throw new Error('Please sign in again to load announcements.');
        }

        const result = await apiRequest('/announcements', 'GET', null, token);

        if (!cancelled) {
          setAnnouncements(
            Array.isArray(result.announcements) ? result.announcements : []
          );
        }
      } catch (error) {
        if (!cancelled) {
          setAnnouncements([]);
          setAnnouncementsError(
            error?.message || 'Unable to load announcements.'
          );
        }
      } finally {
        if (!cancelled) {
          setAnnouncementsLoading(false);
        }
      }
    }

    loadAnnouncements();

    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    let cancelled = false;

    async function loadPerformance() {
      if (!user) {
        setPerformance(null);
        setPerformanceError('');
        setPerformanceLoading(false);
        return;
      }

      setPerformanceLoading(true);
      setPerformanceError('');

      try {
        const token = await getStoredToken();

        if (!token) {
          throw new Error('Please sign in again to load your performance.');
        }

        const result = await apiRequest('/my-performance', 'GET', null, token);

        if (!cancelled) {
          setPerformance(result.performance || null);
        }
      } catch (error) {
        if (!cancelled) {
          setPerformance(null);
          setPerformanceError(error.message);
        }
      } finally {
        if (!cancelled) {
          setPerformanceLoading(false);
        }
      }
    }

    loadPerformance();

    return () => {
      cancelled = true;
    };
  }, [user]);

 
  useEffect(() => {
    let cancelled = false;

    async function loadNotificationSettings() {
      if (!user || Platform.OS !== 'web') {
        setNotificationSubscribed(false);
        return;
      }

      try {
        const token = await getStoredToken();
        if (!token) return;

        const result = await apiRequest(
          '/notifications/preferences',
          'GET',
          null,
          token
        );

        if (cancelled) return;

        setNotificationPreferences({
          campaigns: result.preferences?.campaigns !== false,
          announcements: result.preferences?.announcements !== false,
          reminders: result.preferences?.reminders !== false,
          account: result.preferences?.account !== false,
        });
        setNotificationSubscribed(Boolean(result.subscribed));

        if (!('Notification' in window) ||
            !('serviceWorker' in navigator) ||
            !('PushManager' in window)) {
          setNotificationError(
            'Push notifications are not supported by this browser. Try installing VEYRA as a web app or use a supported browser.'
          );
          return;
        }

        if (Notification.permission === 'denied') {
          setNotificationError(
            'Notifications are blocked by your browser. Change VEYRA notification permissions in your browser settings to enable them.'
          );
          return;
        }

        if (result.subscribed) return;

        const promptKey = `veyra_notification_prompt_${user.id}`;
        const saved = localStorage.getItem(promptKey);
        const promptState = saved ? JSON.parse(saved) : {};

        if (promptState.enabled || promptState.denied) return;

        if (!promptState.remindAt || Date.now() >= promptState.remindAt) {
          setNotificationPromptVisible(true);
        }
      } catch (error) {
        if (!cancelled) {
          setNotificationError(error.message || 'Unable to load notification settings.');
        }
      }
    }

    loadNotificationSettings();

    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;

    const requestedTab = new URLSearchParams(window.location.search).get('veyra_tab');

    if (requestedTab === 'Events' || requestedTab === 'Profile') {
      setActiveTab(requestedTab);
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  async function handleRefresh() {
    if (!user || refreshing) return;

    setRefreshing(true);

    try {
      const token = await getStoredToken();
      if (!token) throw new Error('Please sign in again to refresh your VEYRA data.');

      const results = await Promise.allSettled([
        apiRequest('/me', 'GET', null, token),
        apiRequest('/my-performance', 'GET', null, token),
        apiRequest('/campaigns', 'GET', null, token),
        apiRequest('/live-challenges', 'GET', null, token),
        apiRequest('/announcements', 'GET', null, token),
      ]);

      const [profileResult, performanceResult, campaignsResult, challengesResult, announcementsResult] = results;

      if (profileResult.status === 'fulfilled') setUser(profileResult.value);

      if (performanceResult.status === 'fulfilled') {
        setPerformance(performanceResult.value.performance || null);
        setPerformanceError('');
      } else {
        setPerformanceError(performanceResult.reason?.message || 'Unable to refresh performance.');
      }

      if (campaignsResult.status === 'fulfilled') {
        setCampaigns(Array.isArray(campaignsResult.value.campaigns) ? campaignsResult.value.campaigns : []);
        setCampaignsError('');
      } else {
        setCampaignsError(campaignsResult.reason?.message || 'Unable to refresh campaigns.');
      }

      if (challengesResult.status === 'fulfilled') {
        setChallenges(Array.isArray(challengesResult.value.challenges) ? challengesResult.value.challenges : []);
        setChallengesError('');
      } else {
        setChallengesError(challengesResult.reason?.message || 'Unable to refresh live challenges.');
      }

      if (announcementsResult.status === 'fulfilled') {
        setAnnouncements(Array.isArray(announcementsResult.value.announcements) ? announcementsResult.value.announcements : []);
        setAnnouncementsError('');
      } else {
        setAnnouncementsError(announcementsResult.reason?.message || 'Unable to refresh announcements.');
      }
    } catch (error) {
      const message = error?.message || 'Unable to refresh VEYRA. Please try again.';
      setPerformanceError(message);
      setCampaignsError(message);
      setChallengesError(message);
      setAnnouncementsError(message);
    } finally {
      setRefreshing(false);
    }
  }
  useEffect(() => {
  if (Platform.OS !== 'web' || !user || typeof document === 'undefined') return;

  let startY = 0;
  let startX = 0;
  let scrollElement = null;
  let triggered = false;

  const root = document.documentElement;
  const body = document.body;
  const oldRootOverscroll = root.style.overscrollBehaviorY;
  const oldBodyOverscroll = body.style.overscrollBehaviorY;

  root.style.overscrollBehaviorY = 'none';
  body.style.overscrollBehaviorY = 'none';

  function findScrollElement(target) {
    let element = target;
    let fallback = null;

    while (
      element &&
      element !== document.body &&
      element !== document.documentElement
    ) {
      const style = window.getComputedStyle(element);
      const canScroll = element.scrollHeight > element.clientHeight + 1;
      const overflow = `${style.overflowY} ${style.overflow}`;

      if (canScroll) {
        if (!fallback) fallback = element;

        if (/(auto|scroll|overlay)/i.test(overflow)) {
          return element;
        }
      }

      element = element.parentElement;
    }

    return fallback || document.scrollingElement || root;
  }

  function onTouchStart(event) {
    if (event.touches.length !== 1) {
      scrollElement = null;
      return;
    }

    startY = event.touches[0].clientY;
    startX = event.touches[0].clientX;
    scrollElement = findScrollElement(event.target);
    triggered = false;
  }

  function onTouchMove(event) {
    if (!scrollElement || event.touches.length !== 1 || triggered || refreshing) {
      return;
    }

    const deltaY = event.touches[0].clientY - startY;
    const deltaX = event.touches[0].clientX - startX;

    // Do not interfere with horizontal swipes.
    if (Math.abs(deltaX) > Math.abs(deltaY)) return;

    const atTop = scrollElement.scrollTop <= 1;

    // Stop the browser's own pull-to-refresh when the app is already at the top.
    if (deltaY > 0 && atTop && event.cancelable) {
      event.preventDefault();
    }

    if (deltaY >= 75 && atTop) {
      triggered = true;
      handleRefresh();
    }
  }

  function onTouchEnd() {
    startY = 0;
    startX = 0;
    scrollElement = null;
    triggered = false;
  }

  document.addEventListener('touchstart', onTouchStart, {
    passive: true,
    capture: true,
  });
  document.addEventListener('touchmove', onTouchMove, {
    passive: false,
    capture: true,
  });
  document.addEventListener('touchend', onTouchEnd, true);
  document.addEventListener('touchcancel', onTouchEnd, true);

  return () => {
    document.removeEventListener('touchstart', onTouchStart, true);
    document.removeEventListener('touchmove', onTouchMove, true);
    document.removeEventListener('touchend', onTouchEnd, true);
    document.removeEventListener('touchcancel', onTouchEnd, true);

    root.style.overscrollBehaviorY = oldRootOverscroll;
    body.style.overscrollBehaviorY = oldBodyOverscroll;
  };
}, [user, refreshing]);
  async function handleEnableNotifications() {
    if (Platform.OS !== 'web') {
      setNotificationError('Push notifications are currently available through the VEYRA web app.');
      return;
    }

    if (!('Notification' in window) ||
        !('serviceWorker' in navigator) ||
        !('PushManager' in window)) {
      setNotificationError('This browser does not support web push notifications.');
      setNotificationPromptVisible(false);
      return;
    }

    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
      navigator.standalone === true;

    if (isIOS && !isStandalone) {
      setNotificationPromptMessage(
        'On iPhone or iPad, first add VEYRA to your Home Screen using Safari?s Share button, then open VEYRA from the new Home Screen icon and enable notifications.'
      );
      return;
    }

    setNotificationBusy(true);
    setNotificationError('');
    setNotificationPromptMessage('');

    try {
      const permission = await Notification.requestPermission();

      if (permission !== 'granted') {
        if (permission === 'denied') {
          localStorage.setItem(
            `veyra_notification_prompt_${user.id}`,
            JSON.stringify({ denied: true })
          );
          setNotificationError(
            'Notifications are blocked. Open your browser settings, find VEYRA, and allow notifications.'
          );
        } else {
          setNotificationError('Notification permission was not granted. You can enable it later in Profile settings.');
        }
        setNotificationPromptVisible(false);
        return;
      }

      const token = await getStoredToken();
      if (!token) throw new Error('Please sign in again before enabling notifications.');

      const keyResult = await apiRequest(
        '/notifications/public-key',
        'GET',
        null,
        token
      );

      const publicKey = keyResult.public_key;
      const padding = '='.repeat((4 - publicKey.length % 4) % 4);
      const base64 = (publicKey + padding).replace(/-/g, '+').replace(/_/g, '/');
      const raw = window.atob(base64);
      const applicationServerKey = Uint8Array.from(raw, char => char.charCodeAt(0));

      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();

      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey,
        });
      }

      await apiRequest(
        '/notifications/subscribe',
        'POST',
        subscription.toJSON(),
        token
      );

      localStorage.setItem(
        `veyra_notification_prompt_${user.id}`,
        JSON.stringify({ enabled: true })
      );

      setNotificationSubscribed(true);
      setNotificationPromptVisible(false);
      setNotificationPromptMessage('');
      setNotificationError('');
    } catch (error) {
      setNotificationError(error.message || 'Unable to enable notifications. Please try again.');
    } finally {
      setNotificationBusy(false);
    }
  }

  async function handleToggleNotification(category, value) {
    const updated = {
      ...notificationPreferences,
      [category]: value,
    };

    setNotificationPreferences(updated);
    setNotificationBusy(true);
    setNotificationError('');

    try {
      const token = await getStoredToken();
      if (!token) throw new Error('Please sign in again.');

      const result = await apiRequest(
        '/notifications/preferences',
        'PUT',
        updated,
        token
      );

      setNotificationPreferences(result.preferences || updated);
    } catch (error) {
      setNotificationPreferences(notificationPreferences);
      setNotificationError(error.message || 'Unable to save notification preferences.');
    } finally {
      setNotificationBusy(false);
    }
  }

  function handleNotificationLater() {
    if (user && Platform.OS === 'web') {
      localStorage.setItem(
        `veyra_notification_prompt_${user.id}`,
        JSON.stringify({ remindAt: Date.now() + 7 * 24 * 60 * 60 * 1000 })
      );
    }
    setNotificationPromptVisible(false);
    setNotificationPromptMessage('');
  }

  async function handleRegister(username, invitationCode) {
    setAuthLoading(true);

    try {
      const result = await apiRequest('/auth/register', 'POST', {
        username,
        invitation_code: invitationCode,
      });

      await setStoredToken(result.access_token);

      const profile = await apiRequest(
        '/me',
        'GET',
        null,
        result.access_token
      );

      setUser(profile);
      setActiveTab('Home');
    } catch (error) {
      Alert.alert('Activation failed', error.message);
    } finally {
      setAuthLoading(false);
    }
  }


  async function handleSaveProfile(displayName) {
    const token = await getStoredToken();

    if (!token) {
      throw new Error('Your session has expired. Please sign in again.');
    }

    const result = await apiRequest(
      '/me',
      'PATCH',
      { display_name: displayName },
      token
    );

    const updatedProfile = result.user || result;
    setUser(updatedProfile);
  }

  async function handleUploadPicture(asset) {
    const token = await getStoredToken();

    if (!token) {
      throw new Error('Your session has expired. Please sign in again.');
    }

    const extension = asset.mimeType?.includes('png')
      ? 'png'
      : asset.mimeType?.includes('webp')
        ? 'webp'
        : 'jpg';

    const imageFile = new File(asset.uri);
    const formData = new FormData();

    formData.append('file', imageFile, `profile.${extension}`);

    const response = await fetch(`${API_URL}/me/profile-picture`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.detail || 'Unable to upload your profile picture.');
    }

    const updatedProfile = await apiRequest('/me', 'GET', null, token);
    setUser(updatedProfile);
  }

  async function handleLogout() {
    await deleteStoredToken();
    setUser(null);
    setPerformance(null);
    setPerformanceError('');
    setCampaigns([]);
    setCampaignsError('');
    setActiveTab('Home');
  }

  function goTo(tab) {
    setActiveTab(tab);
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="light-content" backgroundColor={C.black} />
        <SmokeBackground />
        <View style={styles.loadingScreen}>
          <Text style={styles.logo}>VEYRA.</Text>
          <ActivityIndicator color={C.white} size="large" />
          <Text style={styles.muted}>Loading your creator space...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!user) {
    return (
<AuthScreen
  onRegister={handleRegister}
  loading={authLoading}
/>
    );
  }

  const screens = {
    Home: (
      <HomeScreen
        refreshing={refreshing}
        onRefresh={handleRefresh}
        performance={performance}
        performanceLoading={performanceLoading}
        performanceError={performanceError}
        user={user}
        goTo={goTo}
      />
    ),

    Analytics: (
      <AnalyticsScreen
        refreshing={refreshing}
        onRefresh={handleRefresh}
        performance={performance}
        performanceLoading={performanceLoading}
        performanceError={performanceError}
        user={user}
      />
    ),

    Goals: (
      <GoalsScreen
        refreshing={refreshing}
        onRefresh={handleRefresh}
        performance={performance}
        performanceLoading={performanceLoading}
        performanceError={performanceError}
        user={user}
      />
    ),

    Events: (
      <EventsScreen
        refreshing={refreshing}
        onRefresh={handleRefresh}
        user={user}
        campaigns={campaigns}
        campaignsLoading={campaignsLoading}
        campaignsError={campaignsError}
        challenges={challenges}
        challengesLoading={challengesLoading}
        challengesError={challengesError}
        announcements={announcements}
        announcementsLoading={announcementsLoading}
        announcementsError={announcementsError}
      />
    ),

    Profile: (
      <ProfileScreen
        refreshing={refreshing}
        onRefresh={handleRefresh}
        email={user.email}
        username={user.username}
        displayName={user.display_name}
        profilePicture={user.profile_picture}
        onSave={handleSaveProfile}
        onUploadPicture={handleUploadPicture}
        onLogout={handleLogout}
        notificationPreferences={notificationPreferences}
        notificationSubscribed={notificationSubscribed}
        notificationBusy={notificationBusy}
        notificationError={notificationError}
        onEnableNotifications={handleEnableNotifications}
        onToggleNotification={handleToggleNotification}
      />
    ),
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={C.black} />

      <View style={styles.app}>
        <SmokeBackground />

        <View style={[styles.content, { paddingHorizontal: Math.max(12, Math.min(20, windowWidth * 0.05)), paddingTop: 10 * responsiveScale }]}>
          {screens[activeTab]}
        </View>

        <View style={[styles.bottomNav, { paddingTop: 10 * responsiveScale, paddingBottom: 7 * responsiveScale }]}>
          {tabs.map((tab) => {
            const selected = activeTab === tab.name;

            return (
              <TouchableOpacity
                key={tab.name}
                style={styles.navItem}
                onPress={() => setActiveTab(tab.name)}
                activeOpacity={0.75}
              >
                <Text style={[
                  styles.navSymbol,
                  selected && styles.navSymbolActive,
                ]}>
                  {tab.symbol}
                </Text>

                <Text style={[
                  styles.navLabel,
                  selected && styles.navLabelActive,
                ]}>
                  {tab.name}
                </Text>

                {selected && <View style={styles.navIndicator} />}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <Modal
        visible={notificationPromptVisible}
        transparent
        animationType="fade"
        onRequestClose={handleNotificationLater}
      >
        <View style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.82)',
          justifyContent: 'center',
          padding: 24,
        }}>
          <View style={{
            backgroundColor: '#171717',
            borderColor: 'rgba(255,255,255,0.16)',
            borderWidth: 1,
            borderRadius: 18,
            padding: 24,
          }}>
            <Text style={{ color: C.white, fontSize: 21, fontWeight: '800', marginBottom: 12 }}>
              Stay in the loop
            </Text>
            <Text style={{ color: C.muted, fontSize: 14, lineHeight: 22, marginBottom: 18 }}>
              Enable VEYRA notifications for campaign opportunities, announcements and important creator updates. You can manage each category in Profile settings.
            </Text>

            {notificationPromptMessage ? (
              <Text style={{ color: '#F0C98B', fontSize: 12, lineHeight: 19, marginBottom: 14 }}>
                {notificationPromptMessage}
              </Text>
            ) : null}

            {notificationError ? (
              <Text style={{ color: '#F0A0A0', fontSize: 12, lineHeight: 19, marginBottom: 14 }}>
                {notificationError}
              </Text>
            ) : null}

            <TouchableOpacity
              onPress={handleEnableNotifications}
              disabled={notificationBusy}
              style={{
                backgroundColor: '#FFFFFF',
                borderRadius: 9,
                paddingVertical: 14,
                alignItems: 'center',
                marginBottom: 10,
              }}
            >
              <Text style={{ color: '#080808', fontWeight: '800', fontSize: 12 }}>
                {notificationBusy ? 'PLEASE WAIT...' : 'ENABLE NOTIFICATIONS'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleNotificationLater}
              style={{ paddingVertical: 11, alignItems: 'center' }}
            >
              <Text style={{ color: C.muted, fontWeight: '600', fontSize: 12 }}>
                MAYBE LATER
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: C.black,
  },

  smokeLayer: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
    backgroundColor: 'transparent',
    zIndex: 0,
  },

  smokeCloudOne: {
    position: 'absolute',
    width: 360,
    height: 190,
    top: 65,
    left: -130,
    borderRadius: 200,
    backgroundColor: '#E5E5E5',
    opacity: 0.15,
    transform: [{ rotate: '-24deg' }],
  },

  smokeCloudTwo: {
    position: 'absolute',
    width: 330,
    height: 170,
    top: 145,
    right: -125,
    borderRadius: 200,
    backgroundColor: '#FFFFFF',
    opacity: 0.13,
    transform: [{ rotate: '28deg' }],
  },

  smokeCloudThree: {
    position: 'absolute',
    width: 390,
    height: 200,
    top: 340,
    left: -145,
    borderRadius: 200,
    backgroundColor: '#CFCFCF',
    opacity: 0.14,
    transform: [{ rotate: '18deg' }],
  },

  smokeCloudFour: {
    position: 'absolute',
    width: 350,
    height: 180,
    top: 455,
    right: -135,
    borderRadius: 200,
    backgroundColor: '#EEEEEE',
    opacity: 0.12,
    transform: [{ rotate: '-25deg' }],
  },

  smokeCloudFive: {
    position: 'absolute',
    width: 390,
    height: 190,
    bottom: 100,
    left: -145,
    borderRadius: 200,
    backgroundColor: '#D0D0D0',
    opacity: 0.14,
    transform: [{ rotate: '-15deg' }],
  },

  smokeCloudSix: {
    position: 'absolute',
    width: 340,
    height: 170,
    bottom: 200,
    right: -125,
    borderRadius: 200,
    backgroundColor: '#FFFFFF',
    opacity: 0.12,
    transform: [{ rotate: '22deg' }],
  },

  smokeCloudSeven: {
    position: 'absolute',
    width: 280,
    height: 150,
    top: 650,
    left: 45,
    borderRadius: 200,
    backgroundColor: '#AAAAAA',
    opacity: 0.12,
    transform: [{ rotate: '12deg' }],
  },

  smokeCloudEight: {
    position: 'absolute',
    width: 300,
    height: 160,
    top: 850,
    right: -20,
    borderRadius: 200,
    backgroundColor: '#DADADA',
    opacity: 0.11,
    transform: [{ rotate: '-18deg' }],
  },

  app: {
    flex: 1,
    backgroundColor: 'transparent',
  },

content: {
  flex: 1,
  width: '100%',
  maxWidth: 1100,
  alignSelf: 'center',
  paddingHorizontal: 20,
  paddingTop: 10,
  zIndex: 1,
},
  
screenContent: {
    paddingBottom: 20,
  },

  loadingScreen: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 20,
    backgroundColor: 'transparent',
  },

authContainer: {
  flexGrow: 1,
  justifyContent: 'center',
  paddingHorizontal: 20,
  paddingVertical: 30,
  width: '100%',
  alignSelf: 'center',
  backgroundColor: 'transparent',
},
  
authBrand: {
    marginBottom: 55,
    alignItems: 'flex-start',
  },

authLogo: {
  width: '100%',
  maxWidth: 230,
  height: 90,
  resizeMode: 'contain',
},

  logo: {
    color: C.white,
    fontSize: 37,
    fontWeight: '900',
    letterSpacing: 6,
  },

  logoDot: {
    color: C.white,
  },

  logoSubtitle: {
    color: C.grey,
    fontSize: 9,
    letterSpacing: 3,
    marginTop: 6,
  },

  authHeading: {
    marginBottom: 30,
  },

  authEyebrow: {
    color: C.white,
    fontSize: 9,
    letterSpacing: 2,
    marginBottom: 13,
    fontWeight: '800',
  },

  authTitle: {
    color: C.white,
    fontSize: 34,
    fontWeight: '900',
    marginBottom: 9,
  },

  muted: {
    color: C.grey,
    fontSize: 12,
    lineHeight: 19,
  },

  field: {
    marginBottom: 19,
  },

  fieldLabel: {
    color: C.grey,
    fontSize: 9,
    letterSpacing: 1.5,
    marginBottom: 9,
    fontWeight: '700',
  },

  input: {
    height: 52,
    backgroundColor: C.card,
    borderColor: C.line,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    color: C.white,
    fontSize: 13,
  },

  button: {
    backgroundColor: C.white,
    minHeight: 51,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },

  buttonText: {
    color: C.black,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.5,
  },

  secondaryButton: {
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.line,
  },

  secondaryButtonText: {
    color: C.white,
  },

  switchAuth: {
    alignItems: 'center',
    marginTop: 24,
  },

  whiteText: {
    color: C.white,
    fontWeight: '800',
  },

  authFooter: {
    color: '#777777',
    fontSize: 8,
    letterSpacing: 1.5,
    textAlign: 'center',
    marginTop: 35,
  },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 27,
  },

  logoSmall: {
    color: C.white,
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 4,
  },

  headerSubtitle: {
    color: C.grey,
    fontSize: 8,
    letterSpacing: 2,
    marginTop: 5,
  },

  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },

  onlineDot: {
    height: 7,
    width: 7,
    borderRadius: 4,
    backgroundColor: C.white,
  },

  avatarSmall: {
    width: 37,
    height: 37,
    borderRadius: 19,
    backgroundColor: C.cardLight,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: C.line,
  },

  avatarLetter: {
    color: C.white,
    fontWeight: '800',
    fontSize: 17,
  },

  eyebrow: {
    color: C.white,
    fontSize: 9,
    letterSpacing: 2,
    marginBottom: 9,
    fontWeight: '800',
  },

  welcomeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },

  welcomeTitle: {
    color: C.white,
    fontSize: 25,
    fontWeight: '800',
  },

  welcomeName: {
    color: C.grey,
    fontSize: 23,
    fontWeight: '600',
    marginTop: 2,
  },

  memberBadge: {
    borderWidth: 1,
    borderColor: '#4C4C4C',
    borderRadius: 9,
    paddingHorizontal: 12,
    paddingVertical: 9,
    alignItems: 'center',
    backgroundColor: C.card,
  },

  memberBadgeText: {
    color: C.white,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 2,
  },

  memberBadgeSub: {
    color: C.grey,
    fontSize: 7,
    letterSpacing: 1.5,
    marginTop: 3,
  },

  heroCard: {
    backgroundColor: '#090909',
    borderRadius: 16,
    padding: 19,
    borderWidth: 1,
    borderColor: '#383838',
    marginBottom: 13,
  },

  heroTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  heroEyebrow: {
    color: C.grey,
    fontSize: 9,
    letterSpacing: 1.6,
    fontWeight: '800',
  },

  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#202020',
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
  },

  livePillDot: {
    height: 6,
    width: 6,
    borderRadius: 3,
    backgroundColor: C.white,
  },

  livePillText: {
    color: C.white,
    fontSize: 7,
    letterSpacing: 1,
    fontWeight: '800',
  },

  heroLabel: {
    color: C.grey,
    fontSize: 12,
    marginTop: 23,
  },

  heroNumber: {
    color: C.white,
    fontSize: 39,
    fontWeight: '900',
    marginTop: 4,
  },

  heroDivider: {
    height: 1,
    backgroundColor: '#3A3A3A',
    marginVertical: 17,
  },

  heroFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  heroFooterLabel: {
    color: C.grey,
    fontSize: 8,
    letterSpacing: 1.4,
    fontWeight: '800',
  },

  heroFooterValue: {
    color: C.white,
    fontSize: 16,
    fontWeight: '800',
    marginTop: 6,
  },

  heroArrow: {
    width: 34,
    height: 34,
    borderRadius: 18,
    backgroundColor: C.white,
    justifyContent: 'center',
    alignItems: 'center',
  },

  heroArrowText: {
    color: C.black,
    fontSize: 20,
    fontWeight: '900',
  },

  sectionHeading: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 26,
    marginBottom: 13,
  },

  sectionTitle: {
    color: C.white,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.5,
  },

  sectionAction: {
    color: C.white,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1,
  },

  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },

  metricCard: {
    width: '48%',
    backgroundColor: '#090909',
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    minHeight: 105,
  },

  metricLabel: {
    color: C.grey,
    fontSize: 8,
    letterSpacing: 1.1,
    fontWeight: '800',
  },

  metricValue: {
    color: C.white,
    fontSize: 23,
    fontWeight: '900',
    marginTop: 13,
  },

  metricDetail: {
    color: C.muted,
    fontSize: 9,
    marginTop: 4,
  },

  targetCard: {
    backgroundColor: '#090909',
    borderRadius: 13,
    borderWidth: 1,
    borderColor: C.line,
    padding: 16,
    marginBottom: 11,
  },

  targetTop: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  targetIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#222222',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 9,
  },

  targetIconText: {
    color: C.white,
    fontSize: 18,
    fontWeight: '900',
  },

  targetLabel: {
    color: C.white,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
    flex: 1,
  },

  targetStatus: {
    backgroundColor: '#222222',
    borderRadius: 5,
    paddingHorizontal: 7,
    paddingVertical: 5,
  },

  targetStatusText: {
    color: C.white,
    fontSize: 7,
    fontWeight: '900',
    letterSpacing: 1,
  },

  targetNumbers: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: 17,
  },

  targetNumber: {
    color: C.white,
    fontSize: 26,
    fontWeight: '900',
  },

  targetOf: {
    color: C.grey,
    fontSize: 11,
  },

  progressTrack: {
    height: 6,
    backgroundColor: '#373737',
    borderRadius: 5,
    marginVertical: 12,
    overflow: 'hidden',
  },

  progressFill: {
    height: '100%',
    backgroundColor: C.white,
    borderRadius: 5,
  },

  targetBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  targetDescription: {
    color: C.grey,
    fontSize: 9,
  },

  targetPercent: {
    color: C.white,
    fontSize: 10,
    fontWeight: '900',
  },

  networkCard: {
    backgroundColor: '#090909',
    borderRadius: 13,
    borderWidth: 1,
    borderColor: '#383838',
    padding: 15,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },

  networkIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#222222',
    justifyContent: 'center',
    alignItems: 'center',
  },

  networkIconText: {
    color: C.white,
    fontSize: 20,
  },

  networkTitle: {
    color: C.white,
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 5,
  },

  networkDescription: {
    color: C.grey,
    fontSize: 9,
    lineHeight: 15,
  },

  networkArrow: {
    color: C.white,
    fontSize: 25,
  },

  messageCard: {
    backgroundColor: '#090909',
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 11,
    padding: 15,
    marginTop: 8,
    gap: 8,
  },

  messageTitle: {
    color: C.white,
    fontSize: 12,
    fontWeight: '800',
  },

  pageTitle: {
    color: C.white,
    fontSize: 32,
    fontWeight: '900',
    marginBottom: 7,
  },

  pageSubtitle: {
    color: C.grey,
    fontSize: 12,
    lineHeight: 19,
    marginBottom: 13,
  },

  analyticsHero: {
    backgroundColor: '#090909',
    borderWidth: 1,
    borderColor: '#383838',
    borderRadius: 15,
    padding: 19,
    marginTop: 15,
  },

  analyticsHeroNumber: {
    color: C.white,
    fontSize: 36,
    fontWeight: '900',
    marginTop: 15,
  },

  analyticsHeroCaption: {
    color: C.grey,
    fontSize: 10,
    marginTop: 5,
  },

  infoCard: {
    backgroundColor: '#090909',
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 12,
    padding: 16,
    marginBottom: 11,
  },

  infoTitle: {
    color: C.white,
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 7,
  },

  goalSummary: {
    backgroundColor: '#090909',
    borderWidth: 1,
    borderColor: '#383838',
    borderRadius: 14,
    padding: 19,
    marginTop: 10,
  },

  goalSummaryTitle: {
    color: C.white,
    fontSize: 20,
    fontWeight: '900',
    marginTop: 14,
    marginBottom: 7,
  },

  goalSummaryText: {
    color: C.grey,
    fontSize: 11,
    lineHeight: 18,
  },

  eventFeature: {
    backgroundColor: '#090909',
    borderRadius: 15,
    borderWidth: 1,
    borderColor: '#383838',
    padding: 20,
    minHeight: 195,
    overflow: 'hidden',
    marginTop: 10,
  },

  eventFeatureEyebrow: {
    color: C.white,
    fontSize: 8,
    letterSpacing: 1.8,
    fontWeight: '900',
  },

  eventFeatureTitle: {
    color: C.white,
    fontSize: 23,
    fontWeight: '900',
    lineHeight: 29,
    marginTop: 17,
    maxWidth: '85%',
  },

  eventFeatureText: {
    color: C.grey,
    fontSize: 10,
    lineHeight: 17,
    marginTop: 10,
    maxWidth: '90%',
  },

  eventFeatureMark: {
    position: 'absolute',
    right: -5,
    bottom: -28,
    opacity: 0.08,
  },

  eventFeatureMarkText: {
    color: C.white,
    fontSize: 130,
    fontWeight: '900',
  },

  comingSoonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  comingSoon: {
    color: C.white,
    fontSize: 7,
    fontWeight: '900',
    letterSpacing: 1,
  },

  profileCard: {
    backgroundColor: '#090909',
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 14,
    padding: 23,
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 10,
  },

  avatarLarge: {
    height: 78,
    width: 78,
    borderRadius: 39,
    backgroundColor: '#222222',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 13,
    borderWidth: 1,
    borderColor: '#484848',
  },

  profileName: {
    color: C.white,
    fontSize: 16,
    fontWeight: '900',
    marginBottom: 5,
  },

  profileEmail: {
    color: C.grey,
    fontSize: 10,
  },

  photoButton: {
    marginTop: 17,
    borderWidth: 1,
    borderColor: '#454545',
    paddingHorizontal: 17,
    paddingVertical: 12,
    borderRadius: 8,
  },

  photoButtonText: {
    color: C.white,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1,
  },

  readOnlyField: {
    backgroundColor: '#080808',
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 9,
    padding: 13,
    marginBottom: 17,
  },

  readOnlyValue: {
    color: C.white,
    fontSize: 13,
    fontWeight: '700',
    marginTop: 7,
  },

  readOnlyHint: {
    color: C.grey,
    fontSize: 9,
    lineHeight: 15,
    marginTop: 7,
  },

  bottomNav: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: C.line,
    backgroundColor: '#080808',
    paddingTop: 10,
    paddingBottom: 7,
  },

  navItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },

  navSymbol: {
    color: C.grey,
    fontSize: 19,
    marginBottom: 4,
  },

  navSymbolActive: {
    color: C.white,
  },

  navLabel: {
    color: C.grey,
    fontSize: 8,
    fontWeight: '600',
  },

  navLabelActive: {
    color: C.white,
    fontWeight: '900',
  },

  navIndicator: {
    width: 14,
    height: 2,
    backgroundColor: C.white,
    borderRadius: 2,
    marginTop: 5,
  },

  bottomSpace: {
    height: 25,
  },
}); 
