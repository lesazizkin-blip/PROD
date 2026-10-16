import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { useTheme } from "react-native-paper";

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>["name"];

const screens: { name: string; title: string; icon: IconName }[] = [
  { name: "index", title: "План", icon: "clipboard-check-outline" },
  { name: "boxes", title: "Коробки", icon: "package-variant-closed" },
  { name: "labels", title: "Этикетки", icon: "qrcode" },
  { name: "progress", title: "Прогресс", icon: "chart-donut" },
];

export default function TabsLayout() {
  const theme = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: theme.colors.surface },
        headerTintColor: theme.colors.onSurface,
        tabBarStyle: { backgroundColor: theme.colors.surface },
        tabBarActiveTintColor: theme.colors.primary,
      }}
    >
      {screens.map((s) => (
        <Tabs.Screen
          key={s.name}
          name={s.name}
          options={{
            title: s.title,
            tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name={s.icon} color={color as string} size={size} />,
          }}
        />
      ))}
    </Tabs>
  );
}
