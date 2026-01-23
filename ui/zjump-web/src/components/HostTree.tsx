import React, { useState, useEffect, useMemo } from 'react';
import {
  Box,
  TextField,
  InputAdornment,
  Typography,
  CircularProgress,
  Paper,
  Chip,
  Collapse,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
} from '@mui/material';
import {
  ExpandMore as ExpandMoreIcon,
  ChevronRight as ChevronRightIcon,
  Search as SearchIcon,
  Computer as ComputerIcon,
  Folder as FolderIcon,
  FolderOpen as FolderOpenIcon,
  Storage as StorageIcon,
  Circle as CircleIcon,
} from '@mui/icons-material';
import { hostApi, hostGroupApi, authApi, HostGroup } from '../api/api';
import { Host } from '../types';
import { useTerminal } from '../contexts/TerminalContext';

interface HostTreeNode {
  id: string;
  name: string;
  type: 'root' | 'group' | 'host';
  children?: HostTreeNode[];
  host?: Host;
  group?: HostGroup;
  count?: number; // 主机数量（用于分组）
}

interface HostTreeProps {
  onHostClick: (host: Host) => void;
}

export default function HostTree({ onHostClick }: HostTreeProps) {
  const { sessions } = useTerminal();
  const [searchKeyword, setSearchKeyword] = useState('');
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string[]>([]);
  const [hostGroups, setHostGroups] = useState<HostGroup[]>([]);
  const [groupHostsMap, setGroupHostsMap] = useState<Map<string, Host[]>>(new Map());
  const [directHosts, setDirectHosts] = useState<Host[]>([]); // 直接授权的主机（不属于任何分组）

  // 获取当前用户信息
  const [user, setUser] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  // 加载当前用户信息
  useEffect(() => {
    const loadCurrentUser = async () => {
      try {
        const userInfo = await authApi.getCurrentUser();
        setUser(userInfo);
        setIsAdmin(userInfo?.role === 'admin');
      } catch (error) {
        console.error('获取当前用户失败:', error);
        // 如果获取失败，尝试从 localStorage 读取
        const userStr = localStorage.getItem('user');
        if (userStr) {
          const localUser = JSON.parse(userStr);
          setUser(localUser);
          setIsAdmin(localUser?.role === 'admin');
        }
      }
    };

    loadCurrentUser();
  }, []);

  // 加载主机分组
  useEffect(() => {
    const loadHostGroups = async () => {
      try {
        const data = await hostGroupApi.listGroups({ stats: true });
        setHostGroups(data.groups || []);
      } catch (error) {
        console.error('加载主机分组失败:', error);
      }
    };

    loadHostGroups();
  }, []);

  // 加载主机列表（按分组加载）
  useEffect(() => {
    const loadHosts = async () => {
      setLoading(true);
      try {
        const newGroupHostsMap = new Map<string, Host[]>();
        const allGroupHostIds = new Set<string>();
        
        // 为每个分组加载主机
        for (const group of hostGroups) {
          try {
            const groupHostsData = await hostGroupApi.getGroupHosts(group.id);
            const groupHosts = (groupHostsData.hosts || []).map((host: any) => ({
              ...host,
              tags: typeof host.tags === 'string' ? JSON.parse(host.tags || '[]') : (host.tags || []),
            }));
            newGroupHostsMap.set(group.id, groupHosts);
            groupHosts.forEach(host => allGroupHostIds.add(host.id));
          } catch (error) {
            console.error(`加载分组 ${group.id} 的主机失败:`, error);
          }
        }

        // 获取所有主机，筛选不属于任何分组的主机
        try {
          const allHostsData = await hostApi.getHosts({ pageSize: 10000 });
          const allHosts = allHostsData.hosts.map(host => ({
            ...host,
            tags: typeof host.tags === 'string' ? JSON.parse(host.tags || '[]') : (host.tags || []),
          }));
          
          // 筛选不属于任何分组的主机
          const directHostsList = allHosts.filter(host => !allGroupHostIds.has(host.id));
          setDirectHosts(directHostsList);
        } catch (error) {
          console.error('加载主机失败:', error);
        }

        setGroupHostsMap(newGroupHostsMap);
      } catch (error) {
        console.error('加载主机列表失败:', error);
      } finally {
        setLoading(false);
      }
    };

    if (hostGroups.length > 0) {
      loadHosts();
    }
  }, [hostGroups]);

  // 构建树形结构
  const treeData = useMemo(() => {
    if (loading || !hostGroups.length) {
      return null;
    }

    // 构建树节点
    const rootNode: HostTreeNode = {
      id: 'root',
      name: '服务树根',
      type: 'root',
      children: [],
    };

    // 添加分组节点
    hostGroups.forEach(group => {
      const groupHosts = groupHostsMap.get(group.id) || [];
      
      if (groupHosts.length > 0 || isAdmin) {
        rootNode.children!.push({
          id: `group-${group.id}`,
          name: group.name,
          type: 'group',
          group,
          count: groupHosts.length,
          children: groupHosts.map(host => ({
            id: `host-${host.id}`,
            name: host.name,
            type: 'host',
            host,
          })),
        });
      }
    });

    // 添加直接授权的主机（不属于任何分组）
    if (directHosts.length > 0) {
      rootNode.children!.push({
        id: 'group-direct',
        name: '直接授权',
        type: 'group',
        count: directHosts.length,
        children: directHosts.map(host => ({
          id: `host-${host.id}`,
          name: host.name,
          type: 'host',
          host,
        })),
      });
    }

    return rootNode;
  }, [hostGroups, groupHostsMap, directHosts, isAdmin, loading]);

  // 过滤树数据（根据搜索关键词）
  const filteredTreeData = useMemo(() => {
    if (!treeData || !searchKeyword.trim()) {
      return treeData;
    }

    const filterNode = (node: HostTreeNode): HostTreeNode | null => {
      const keyword = searchKeyword.toLowerCase();
      
      if (node.type === 'host') {
        // 主机节点：匹配名称或IP
        const host = node.host!;
        if (
          host.name.toLowerCase().includes(keyword) ||
          host.ip?.toLowerCase().includes(keyword)
        ) {
          return node;
        }
        return null;
      }

      if (node.type === 'group') {
        // 分组节点：检查名称或子节点
        const matchesName = node.name.toLowerCase().includes(keyword);
        const filteredChildren = node.children
          ?.map(child => filterNode(child))
          .filter((child): child is HostTreeNode => child !== null) || [];

        if (matchesName || filteredChildren.length > 0) {
          return {
            ...node,
            children: filteredChildren,
          };
        }
        return null;
      }

      // 根节点：过滤子节点
      if (node.type === 'root') {
        const filteredChildren = node.children
          ?.map(child => filterNode(child))
          .filter((child): child is HostTreeNode => child !== null) || [];

        return {
          ...node,
          children: filteredChildren,
        };
      }

      return node;
    };

    return filterNode(treeData);
  }, [treeData, searchKeyword]);

  // 切换节点展开/折叠
  const handleToggle = (nodeId: string) => {
    setExpanded(prev => {
      if (prev.includes(nodeId)) {
        return prev.filter(id => id !== nodeId);
      } else {
        return [...prev, nodeId];
      }
    });
  };

  // 获取状态颜色
  const getStatusColor = (status: 'online' | 'offline' | 'unknown') => {
    switch (status) {
      case 'online':
        return 'success.main';
      case 'offline':
        return 'error.main';
      default:
        return 'text.disabled';
    }
  };

  // 渲染树节点
  const renderTreeItem = (node: HostTreeNode, level: number = 0): React.ReactNode => {
    if (!node) return null;

    const isExpanded = expanded.includes(node.id);
    const hasChildren = node.children && node.children.length > 0;
    const hasActiveSession = node.type === 'host' && node.host
      ? sessions.some(s => s.host.id === node.host!.id)
      : false;

    let icon: React.ReactNode;
    let label: React.ReactNode;

    if (node.type === 'root') {
      icon = <StorageIcon sx={{ fontSize: 18 }} />;
      label = (
        <Typography variant="body2" fontWeight={600}>
          {node.name}
        </Typography>
      );
    } else if (node.type === 'group') {
      icon = isExpanded ? (
        <FolderOpenIcon sx={{ fontSize: 18 }} />
      ) : (
        <FolderIcon sx={{ fontSize: 18 }} />
      );
      label = (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1 }}>
          <Typography variant="body2">{node.name}</Typography>
          {node.count !== undefined && (
            <Chip
              label={node.count}
              size="small"
              sx={{ height: 20, fontSize: '0.7rem', minWidth: 24 }}
            />
          )}
        </Box>
      );
    } else {
      // 主机节点
      const host = node.host!;
      const statusColor = getStatusColor(host.status);
      
      icon = <ComputerIcon sx={{ fontSize: 18 }} />;
      label = (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1, minWidth: 0 }}>
          {host.ip ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flex: 1, minWidth: 0 }}>
              {/* 状态指示器 */}
              <CircleIcon 
                sx={{ 
                  fontSize: 8, 
                  color: statusColor,
                  filter: host.status === 'online' ? 'drop-shadow(0 0 2px currentColor)' : 'none',
                  flexShrink: 0,
                }} 
              />
              {/* IP地址 */}
              <Typography 
                variant="body2" 
                sx={{ 
                  flex: 1,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  fontWeight: hasActiveSession ? 600 : 400,
                  fontFamily: 'monospace',
                }}
              >
                {host.ip}
              </Typography>
            </Box>
          ) : (
            <Typography 
              variant="body2" 
              sx={{ 
                flex: 1,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                fontWeight: hasActiveSession ? 600 : 400,
              }}
            >
              {node.name}
            </Typography>
          )}
          {hasActiveSession && (
            <Chip
              label="已连接"
              size="small"
              color="success"
              sx={{ height: 18, fontSize: '0.65rem', flexShrink: 0 }}
            />
          )}
        </Box>
      );
    }

    return (
      <React.Fragment key={node.id}>
        <ListItemButton
          onClick={() => {
            if (hasChildren) {
              handleToggle(node.id);
            } else if (node.type === 'host' && node.host) {
              onHostClick(node.host);
            }
          }}
          sx={{
            pl: level * 2 + 2,
            py: 0.75,
            minHeight: 40,
            borderRadius: 1,
            mb: 0.25,
            '&:hover': {
              backgroundColor: 'action.hover',
            },
            ...(node.type === 'host' && hasActiveSession && {
              backgroundColor: 'action.selected',
              '&:hover': {
                backgroundColor: 'action.selected',
              },
            }),
          }}
        >
          <ListItemIcon sx={{ minWidth: 28 }}>
            {hasChildren ? (
              isExpanded ? <ExpandMoreIcon sx={{ fontSize: 18 }} /> : <ChevronRightIcon sx={{ fontSize: 18 }} />
            ) : (
              <Box sx={{ width: 18 }} />
            )}
          </ListItemIcon>
          <ListItemIcon sx={{ minWidth: 36 }}>
            {icon}
          </ListItemIcon>
          <ListItemText
            primary={label}
            sx={{
              '& .MuiListItemText-primary': {
                display: 'flex',
                alignItems: 'center',
                margin: 0,
              },
            }}
          />
        </ListItemButton>
        {hasChildren && (
          <Collapse in={isExpanded} timeout="auto" unmountOnExit>
            <List component="div" disablePadding>
              {node.children?.map(child => renderTreeItem(child, level + 1))}
            </List>
          </Collapse>
        )}
      </React.Fragment>
    );
  };

  // 默认展开所有分组
  useEffect(() => {
    if (treeData && expanded.length === 0) {
      const groupIds = treeData.children?.map(child => child.id) || [];
      setExpanded(['root', ...groupIds]);
    }
  }, [treeData, expanded.length]);

  if (loading) {
    return (
      <Paper sx={{ p: 3, height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <CircularProgress size={24} />
      </Paper>
    );
  }

  if (!treeData || !treeData.children || treeData.children.length === 0) {
    return (
      <Paper sx={{ p: 3, height: '100%' }}>
        <Typography variant="body2" color="text.secondary" textAlign="center">
          暂无可用主机
        </Typography>
      </Paper>
    );
  }

  return (
    <Paper sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
        <TextField
          fullWidth
          size="small"
          placeholder="搜索主机..."
          value={searchKeyword}
          onChange={(e) => setSearchKeyword(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            ),
          }}
        />
      </Box>
      <Box sx={{ flex: 1, overflow: 'auto' }}>
        <List component="nav" disablePadding>
          {filteredTreeData?.children?.map(child => renderTreeItem(child, 0))}
        </List>
      </Box>
    </Paper>
  );
}


