import { useState, useEffect } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  IconButton,
  Typography,
  Chip,
  List,
  ListItem,
  ListItemText,
  Divider,
  Alert,
  Checkbox,
  Stack,
  Paper,
  Avatar,
  Menu,
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  InputAdornment,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Computer as ComputerIcon,
  Group as GroupIcon,
  CheckCircle as OnlineIcon,
  Cancel as OfflineIcon,
  MoreVert as MoreVertIcon,
  Search as SearchIcon,
  Sort as SortIcon,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import axiosInstance from '../api/request';

interface HostGroup {
  id: string;
  name: string;
  description: string;
  color: string;
  icon: string;
  sortOrder: number;
  hostCount: number;
  onlineCount: number;
  createdAt: string;
}

interface Host {
  id: string;
  name: string;
  ip: string;
  port: number;
  status: string;
  deviceType: string;
}

export default function HostGroups() {
  const { t } = useTranslation();
  const [groups, setGroups] = useState<HostGroup[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<HostGroup | null>(null);
  const [groupHosts, setGroupHosts] = useState<Record<string, Host[]>>({});
  const [allHosts, setAllHosts] = useState<Host[]>([]);
  const [, setLoading] = useState(false);
  
  // View and filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'hostCount' | 'createdAt'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(20);
  const [_selectedTab] = useState(0);
  
  // Menu state
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [menuGroup, setMenuGroup] = useState<HostGroup | null>(null);
  const [sortMenuAnchor, setSortMenuAnchor] = useState<null | HTMLElement>(null);
  
  // Dialog states
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [addHostDialogOpen, setAddHostDialogOpen] = useState(false);
  const [usersDialogOpen, setUsersDialogOpen] = useState(false);
  const [groupUsers, setGroupUsers] = useState<any[]>([]);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [hostDetailDialogOpen, setHostDetailDialogOpen] = useState(false);
  
  // Form states
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    color: '#607d8b',
  });
  
  const [selectedHosts, setSelectedHosts] = useState<string[]>([]);
  const [hostSearchQuery, setHostSearchQuery] = useState('');
  const [hostPage, setHostPage] = useState(0);
  const [hostRowsPerPage, setHostRowsPerPage] = useState(10);

  // 加载分组列表
  const loadGroups = async () => {
    try {
      setLoading(true);
      const response = await axiosInstance.get('/api/host-groups?stats=true');
      if (response.data.code === 0) {
        // 后端返回结构: { code: 0, data: { groups: [...], total: N }, msg: 'success' }
        setGroups(response.data.data?.groups || response.data.data || []);
      }
    } catch (error) {
      console.error('Failed to load groups:', error);
    } finally {
      setLoading(false);
    }
  };

  // 加载分组内的主机
  const loadGroupHosts = async (groupId: string) => {
    try {
      // 获取分组内的所有主机，设置较大的 pageSize
      const response = await axiosInstance.get(`/api/host-groups/${groupId}/hosts?pageSize=10000`);
      if (response.data.code === 0) {
        setGroupHosts(prev => ({
          ...prev,
          [groupId]: response.data.data.hosts || []
        }));
      }
    } catch (error) {
      console.error('Failed to load group hosts:', error);
    }
  };

  // 加载所有主机
  const loadAllHosts = async () => {
    try {
      const response = await axiosInstance.get('/api/hosts?pageSize=10000'); // 获取所有主机
      if (response.data.code === 0) {
        setAllHosts(response.data.data?.hosts || []); // 修复：使用 .hosts
      }
    } catch (error) {
      console.error('Failed to load all hosts:', error);
    }
  };

  useEffect(() => {
    loadGroups();
    loadAllHosts();
  }, []);

  // 打开主机详情对话框时加载主机数据
  useEffect(() => {
    if (hostDetailDialogOpen && selectedGroup && !groupHosts[selectedGroup.id]) {
      loadGroupHosts(selectedGroup.id);
    }
  }, [hostDetailDialogOpen, selectedGroup]);

  // 创建分组
  const handleCreateGroup = async () => {
    try {
      const response = await axiosInstance.post('/api/host-groups', formData);
      if (response.data.code === 0) {
        setCreateDialogOpen(false);
        loadGroups();
        setFormData({ name: '', description: '', color: '#607d8b' });
      }
    } catch (error) {
      console.error('Failed to create group:', error);
    }
  };

  // 更新分组
  const handleUpdateGroup = async () => {
    if (!selectedGroup) return;
    try {
      const response = await axiosInstance.put(`/api/host-groups/${selectedGroup.id}`, formData);
      if (response.data.code === 0) {
        setEditDialogOpen(false);
        loadGroups();
        setFormData({ name: '', description: '', color: '#607d8b' });
      }
    } catch (error) {
      console.error('Failed to update group:', error);
    }
  };

  // 删除分组
  const handleDeleteGroup = async () => {
    if (!selectedGroup) return;
    try {
      const response = await axiosInstance.delete(`/api/host-groups/${selectedGroup.id}`);
      if (response.data.code === 0) {
        setDeleteDialogOpen(false);
        setSelectedGroup(null);
        loadGroups();
      }
    } catch (error) {
      console.error('Failed to delete group:', error);
    }
  };

  // 添加主机到分组
  const handleAddHosts = async () => {
    if (!selectedGroup || selectedHosts.length === 0) return;
    try {
      const response = await axiosInstance.post(`/api/host-groups/${selectedGroup.id}/hosts`, {
        hostIds: selectedHosts,
      });
      if (response.data.code === 0) {
        setAddHostDialogOpen(false);
        setSelectedHosts([]);
        setHostSearchQuery('');
        setHostPage(0);
        // 重新加载该分组的主机列表
        await loadGroupHosts(selectedGroup.id);
        // 刷新统计信息
        await loadGroups();
        // 如果主机详情对话框是打开的，也打开它
        setHostDetailDialogOpen(true);
      }
    } catch (error) {
      console.error('Failed to add hosts:', error);
    }
  };

  // 从分组移除主机
  const handleRemoveHost = async (hostId: string) => {
    if (!selectedGroup) return;
    try {
      const response = await axiosInstance.delete(`/api/host-groups/${selectedGroup.id}/hosts`, {
        data: { hostIds: [hostId] },
      });
      if (response.data.code === 0) {
        // 重新加载该分组的主机列表
        await loadGroupHosts(selectedGroup.id);
        // 刷新统计信息
        await loadGroups();
      }
    } catch (error) {
      console.error('Failed to remove host:', error);
    }
  };

  // 菜单操作
  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>, group: HostGroup) => {
    event.stopPropagation();
    setAnchorEl(event.currentTarget);
    setMenuGroup(group);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
    setMenuGroup(null);
  };

  const handleEdit = () => {
    if (menuGroup) {
      openEditDialog(menuGroup);
    }
    handleMenuClose();
  };

  const handleDeleteClick = () => {
    if (menuGroup) {
      setSelectedGroup(menuGroup);
      setDeleteDialogOpen(true);
    }
    handleMenuClose();
  };

  // 查看授权用户
  const handleViewUsers = async () => {
    if (menuGroup) {
      setSelectedGroup(menuGroup);
      setLoading(true);
      try {
        const response = await axiosInstance.get(`/api/host-groups/${menuGroup.id}/users`);
        if (response.data.code === 0) {
          setGroupUsers(response.data.data.users || []);
          setUsersDialogOpen(true);
        }
      } catch (error) {
        console.error('Failed to load group users:', error);
        setGroupUsers([]);
      } finally {
        setLoading(false);
      }
    }
    handleMenuClose();
  };

  const handleAddHostClick = (group: HostGroup) => {
    setSelectedGroup(group);
    setAddHostDialogOpen(true);
  };

  // 打开编辑对话框
  const openEditDialog = (group: HostGroup) => {
    setSelectedGroup(group);
    setFormData({
      name: group.name,
      description: group.description,
      color: group.color || '#607d8b',
    });
    setEditDialogOpen(true);
  };

  // 获取未在当前分组的主机列表
  const getAvailableHosts = () => {
    if (!selectedGroup) return [];
    const currentGroupHosts = groupHosts[selectedGroup.id] || [];
    const groupHostIds = new Set(currentGroupHosts.map(h => h.id));
    return allHosts.filter(h => !groupHostIds.has(h.id));
  };

  // 过滤和排序分组
  const getFilteredAndSortedGroups = () => {
    let filtered = groups;

    // 搜索过滤
    if (searchQuery) {
      filtered = filtered.filter(group =>
        group.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        group.description.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // 排序
    filtered = [...filtered].sort((a, b) => {
      let aValue: any = a[sortBy];
      let bValue: any = b[sortBy];

      if (sortBy === 'createdAt') {
        aValue = new Date(aValue).getTime();
        bValue = new Date(bValue).getTime();
      }

      if (sortOrder === 'asc') {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    });

    return filtered;
  };

  // 获取当前页的分组
  const getPaginatedGroups = () => {
    const filtered = getFilteredAndSortedGroups();
    const start = page * rowsPerPage;
    const end = start + rowsPerPage;
    return filtered.slice(start, end);
  };

  // 过滤主机（用于对话框）
  const getFilteredHosts = (hosts: Host[]) => {
    if (!hostSearchQuery) return hosts;
    return hosts.filter(host =>
      host.name.toLowerCase().includes(hostSearchQuery.toLowerCase()) ||
      host.ip.includes(hostSearchQuery)
    );
  };

  // 获取分页的主机
  const getPaginatedHosts = (hosts: Host[]) => {
    const filtered = getFilteredHosts(hosts);
    const start = hostPage * hostRowsPerPage;
    const end = start + hostRowsPerPage;
    return filtered.slice(start, end);
  };

  // 统计数据
  const totalGroups = groups.length;
  // 修复：从所有主机列表获取真实的主机总数，避免重复计算
  // 一台主机可能属于多个分组，不能简单累加
  const totalHosts = allHosts.length;
  const totalOnline = allHosts.filter(h => h.status === 'online').length;
  const filteredGroups = getFilteredAndSortedGroups();

  // 处理分页变化
  const handleChangePage = (_event: unknown, newPage: number) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  return (
    <Box sx={{ p: 3 }}>
      {/* 页面头部 */}
      <Box sx={{ mb: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Box>
            <Typography variant="h4" sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
              <GroupIcon fontSize="large" />
              {t('hostGroups.title')}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {t('hostGroups.subtitle')}
            </Typography>
          </Box>
          <Button
            variant="contained"
            size="large"
            startIcon={<AddIcon />}
            onClick={() => setCreateDialogOpen(true)}
            sx={{ borderRadius: 2 }}
          >
            {t('hostGroups.createGroup')}
          </Button>
        </Box>

        {/* 统计卡片 */}
        <Box 
          sx={{ 
            display: 'flex', 
            gap: 2, 
            mb: 3,
            width: '100%',
            flexWrap: 'wrap',
          }}
        >
          <Card 
            sx={{ 
              flex: 1,
              minWidth: { xs: '100%', sm: 'calc(33.333% - 12px)' },
              bgcolor: 'primary.main', 
              color: 'white',
              height: 160,
              borderRadius: 3,
              transition: 'all 0.3s ease',
              '&:hover': {
                transform: 'translateY(-4px)',
                boxShadow: 6,
              },
            }}
          >
            <CardContent sx={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box>
                  <Typography variant="body2" sx={{ opacity: 0.9, mb: 1 }}>
                    {t('hostGroups.stats.totalGroups')}
                  </Typography>
                  <Typography variant="h2" sx={{ fontWeight: 700, lineHeight: 1 }}>
                    {totalGroups}
                  </Typography>
                  <Typography variant="caption" sx={{ opacity: 0.8, mt: 1, display: 'block' }}>
                    {t('hostGroups.stats.groups')}
                  </Typography>
                </Box>
                <Box sx={{ 
                  bgcolor: 'rgba(255, 255, 255, 0.2)', 
                  borderRadius: '50%', 
                  p: 2,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  <GroupIcon sx={{ fontSize: 48 }} />
                </Box>
              </Box>
            </CardContent>
          </Card>

          <Card 
            sx={{ 
              flex: 1,
              minWidth: { xs: '100%', sm: 'calc(33.333% - 12px)' },
              bgcolor: 'success.main', 
              color: 'white',
              height: 160,
              borderRadius: 3,
              transition: 'all 0.3s ease',
              '&:hover': {
                transform: 'translateY(-4px)',
                boxShadow: 6,
              },
            }}
          >
            <CardContent sx={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box>
                  <Typography variant="body2" sx={{ opacity: 0.9, mb: 1 }}>
                    {t('hostGroups.stats.totalHosts')}
                  </Typography>
                  <Typography variant="h2" sx={{ fontWeight: 700, lineHeight: 1 }}>
                    {totalHosts}
                  </Typography>
                  <Typography variant="caption" sx={{ opacity: 0.8, mt: 1, display: 'block' }}>
                    {t('hostGroups.stats.hosts')}
                  </Typography>
                </Box>
                <Box sx={{ 
                  bgcolor: 'rgba(255, 255, 255, 0.2)', 
                  borderRadius: '50%', 
                  p: 2,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  <ComputerIcon sx={{ fontSize: 48 }} />
                </Box>
              </Box>
            </CardContent>
          </Card>

          <Card 
            sx={{ 
              flex: 1,
              minWidth: { xs: '100%', sm: 'calc(33.333% - 12px)' },
              bgcolor: 'info.main', 
              color: 'white',
              height: 160,
              borderRadius: 3,
              transition: 'all 0.3s ease',
              '&:hover': {
                transform: 'translateY(-4px)',
                boxShadow: 6,
              },
            }}
          >
            <CardContent sx={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box>
                  <Typography variant="body2" sx={{ opacity: 0.9, mb: 1 }}>
                    {t('hostGroups.stats.onlineHosts')}
                  </Typography>
                  <Typography variant="h2" sx={{ fontWeight: 700, lineHeight: 1 }}>
                    {totalOnline}
                  </Typography>
                  <Typography variant="caption" sx={{ opacity: 0.8, mt: 1, display: 'block' }}>
                    {totalHosts > 0 ? Math.round((totalOnline / totalHosts) * 100) : 0}% {t('hostGroups.stats.onlineRate')}
                  </Typography>
                </Box>
                <Box sx={{ 
                  bgcolor: 'rgba(255, 255, 255, 0.2)', 
                  borderRadius: '50%', 
                  p: 2,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  <OnlineIcon sx={{ fontSize: 48 }} />
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Box>
      </Box>

      {/* 工具栏 */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: 2, alignItems: 'center' }}>
          <Box sx={{ flex: { xs: 'none', md: '0 0 33.333%' } }}>
            <TextField
              fullWidth
              size="small"
              placeholder={t('hostGroups.search.placeholder')}
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(0);
              }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon />
                  </InputAdornment>
                ),
              }}
            />
          </Box>
          <Box sx={{ flex: 1 }}>
            <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', justifyContent: 'flex-end' }}>
              {/* 排序按钮 */}
              <Button
                startIcon={<SortIcon />}
                onClick={(e) => setSortMenuAnchor(e.currentTarget)}
                variant="outlined"
                size="small"
              >
                {t('hostGroups.search.sort')}: {sortBy === 'name' ? t('common.name') : sortBy === 'hostCount' ? t('hostGroups.table.hostCount') : t('common.createdAt')}
              </Button>

              {/* 显示结果数 */}
              <Typography variant="body2" color="text.secondary">
                {t('hostGroups.search.showing', { filtered: filteredGroups.length, total: totalGroups })}
              </Typography>
            </Box>
          </Box>
        </Box>
      </Paper>

      {/* 排序菜单 */}
      <Menu
        anchorEl={sortMenuAnchor}
        open={Boolean(sortMenuAnchor)}
        onClose={() => setSortMenuAnchor(null)}
      >
        <MenuItem onClick={() => { setSortBy('name'); setSortOrder('asc'); setSortMenuAnchor(null); }}>
          {t('hostGroups.search.sortBy.nameAsc')}
        </MenuItem>
        <MenuItem onClick={() => { setSortBy('name'); setSortOrder('desc'); setSortMenuAnchor(null); }}>
          {t('hostGroups.search.sortBy.nameDesc')}
        </MenuItem>
        <MenuItem onClick={() => { setSortBy('hostCount'); setSortOrder('desc'); setSortMenuAnchor(null); }}>
          {t('hostGroups.search.sortBy.hostCountDesc')}
        </MenuItem>
        <MenuItem onClick={() => { setSortBy('hostCount'); setSortOrder('asc'); setSortMenuAnchor(null); }}>
          {t('hostGroups.search.sortBy.hostCountAsc')}
        </MenuItem>
        <MenuItem onClick={() => { setSortBy('createdAt'); setSortOrder('desc'); setSortMenuAnchor(null); }}>
          {t('hostGroups.search.sortBy.timeDesc')}
        </MenuItem>
        <MenuItem onClick={() => { setSortBy('createdAt'); setSortOrder('asc'); setSortMenuAnchor(null); }}>
          {t('hostGroups.search.sortBy.timeAsc')}
        </MenuItem>
      </Menu>

      {/* 主内容区域 */}
      {groups.length === 0 ? (
        <Paper 
          sx={{ 
            p: 6, 
            textAlign: 'center',
            borderRadius: 3,
            background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.05) 0%, rgba(168, 85, 247, 0.05) 100%)'
          }}
        >
          <GroupIcon sx={{ fontSize: 80, color: 'text.secondary', mb: 2, opacity: 0.5 }} />
          <Typography variant="h6" color="text.secondary" gutterBottom>
            {t('hostGroups.empty.noGroups')}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            {t('hostGroups.empty.noGroupsDesc')}
          </Typography>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setCreateDialogOpen(true)}
          >
            {t('hostGroups.empty.createFirst')}
          </Button>
        </Paper>
      ) : filteredGroups.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <SearchIcon sx={{ fontSize: 60, color: 'text.secondary', mb: 2 }} />
          <Typography variant="h6" color="text.secondary">
            {t('hostGroups.empty.noResults')}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            {t('hostGroups.empty.noResultsDesc')}
          </Typography>
        </Paper>
      ) : (
        <>
          {/* 表格视图 */}
          <TableContainer component={Paper}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>{t('hostGroups.table.groupInfo')}</TableCell>
                    <TableCell align="center">{t('hostGroups.table.hostCount')}</TableCell>
                    <TableCell align="center">{t('hostGroups.table.onlineCount')}</TableCell>
                    <TableCell align="center">{t('hostGroups.table.onlineRate')}</TableCell>
                    <TableCell align="center">{t('hostGroups.table.createdAt')}</TableCell>
                    <TableCell align="right">{t('common.actions')}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {getPaginatedGroups().map((group) => (
                    <TableRow 
                      key={group.id}
                      hover
                      sx={{ cursor: 'pointer' }}
                      onClick={() => {
                        setSelectedGroup(group);
                        setHostDetailDialogOpen(true);
                      }}
                    >
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                          <Avatar 
                            sx={{ 
                              bgcolor: group.color,
                              width: 40,
                              height: 40,
                              fontWeight: 600,
                              fontSize: '1.2rem',
                            }}
                          >
                            {group.name?.[0]?.toUpperCase()}
                          </Avatar>
                          <Box>
                            <Typography variant="subtitle2" fontWeight={600}>
                              {group.name}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {group.description || t('hostGroups.dialog.noDescription')}
                            </Typography>
                          </Box>
                        </Box>
                      </TableCell>
                      <TableCell align="center">
                        <Chip 
                          icon={<ComputerIcon />} 
                          label={group.hostCount} 
                          size="small"
                          variant="outlined"
                        />
                      </TableCell>
                      <TableCell align="center">
                        <Chip 
                          icon={<OnlineIcon />} 
                          label={group.onlineCount} 
                          size="small"
                          color="success"
                        />
                      </TableCell>
                      <TableCell align="center">
                        <Typography variant="body2">
                          {group.hostCount > 0 
                            ? `${Math.round((group.onlineCount / group.hostCount) * 100)}%` 
                            : '-'}
                        </Typography>
                      </TableCell>
                      <TableCell align="center">
                        <Typography variant="caption" color="text.secondary">
                          {new Date(group.createdAt).toLocaleDateString()}
                        </Typography>
                      </TableCell>
                      <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                        <IconButton 
                          size="small" 
                          onClick={(e) => {
                            e.stopPropagation();
                            openEditDialog(group);
                          }}
                        >
                          <EditIcon fontSize="small" />
                        </IconButton>
                        <IconButton 
                          size="small" 
                          onClick={(e) => {
                            e.stopPropagation();
                            handleAddHostClick(group);
                          }}
                        >
                          <AddIcon fontSize="small" />
                        </IconButton>
                        <IconButton 
                          size="small" 
                          onClick={(e) => handleMenuOpen(e, group)}
                        >
                          <MoreVertIcon fontSize="small" />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>

          {/* 分页 */}
          <Paper sx={{ mt: 2 }}>
            <TablePagination
              component="div"
              count={filteredGroups.length}
              page={page}
              onPageChange={handleChangePage}
              rowsPerPage={rowsPerPage}
              onRowsPerPageChange={handleChangeRowsPerPage}
              rowsPerPageOptions={[10, 20, 50, 100]}
              labelRowsPerPage={t('hostGroups.pagination.rowsPerPage')}
              labelDisplayedRows={({ from, to, count }) => t('hostGroups.pagination.displayedRows', { from, to, count })}
            />
          </Paper>
        </>
      )}

      {/* 操作菜单 */}
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleMenuClose}
      >
        <MenuItem onClick={handleEdit}>
          <EditIcon sx={{ mr: 1 }} fontSize="small" />
          {t('hostGroups.actions.edit')}
        </MenuItem>
        <MenuItem onClick={handleViewUsers}>
          <GroupIcon sx={{ mr: 1 }} fontSize="small" />
          查看授权用户
        </MenuItem>
        <MenuItem 
          onClick={handleDeleteClick}
          disabled={menuGroup?.name === 'Default'}
          sx={{ color: 'error.main' }}
        >
          <DeleteIcon sx={{ mr: 1 }} fontSize="small" />
          {t('hostGroups.actions.delete')}
        </MenuItem>
      </Menu>

      {/* 创建分组对话框 */}
      <Dialog open={createDialogOpen} onClose={() => setCreateDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{t('hostGroups.dialog.create')}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label={t('hostGroups.groupName')}
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              fullWidth
              required
            />
            <TextField
              label={t('hostGroups.groupDescription')}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              fullWidth
              multiline
              rows={2}
              placeholder={t('hostGroups.dialog.descPlaceholder')}
            />
            <TextField
              label={t('hostGroups.groupColor')}
              type="color"
              value={formData.color}
              onChange={(e) => setFormData({ ...formData, color: e.target.value })}
              fullWidth
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateDialogOpen(false)}>{t('hostGroups.actions.cancel')}</Button>
          <Button onClick={handleCreateGroup} variant="contained" disabled={!formData.name}>
            {t('hostGroups.actions.create')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* 编辑分组对话框 */}
      <Dialog open={editDialogOpen} onClose={() => setEditDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{t('hostGroups.dialog.edit')}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label={t('hostGroups.groupName')}
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              fullWidth
              required
            />
            <TextField
              label={t('hostGroups.groupDescription')}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              fullWidth
              multiline
              rows={2}
              placeholder={t('hostGroups.dialog.descPlaceholder')}
            />
            <TextField
              label={t('hostGroups.groupColor')}
              type="color"
              value={formData.color}
              onChange={(e) => setFormData({ ...formData, color: e.target.value })}
              fullWidth
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDialogOpen(false)}>{t('hostGroups.actions.cancel')}</Button>
          <Button onClick={handleUpdateGroup} variant="contained" disabled={!formData.name}>
            {t('hostGroups.actions.save')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* 主机详情对话框 */}
      <Dialog 
        open={hostDetailDialogOpen} 
        onClose={() => {
          setHostDetailDialogOpen(false);
          setHostSearchQuery('');
          setHostPage(0);
        }}
        maxWidth="lg" 
        fullWidth
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Avatar 
                sx={{ 
                  bgcolor: selectedGroup?.color,
                  width: 48,
                  height: 48,
                  fontWeight: 700,
                  fontSize: '1.5rem',
                }}
              >
                {selectedGroup?.name?.[0]?.toUpperCase()}
              </Avatar>
              <Box>
                <Typography variant="h6">{selectedGroup?.name}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {selectedGroup?.description || t('hostGroups.dialog.noDescription')}
                </Typography>
              </Box>
            </Box>
            <Button
              variant="outlined"
              startIcon={<AddIcon />}
              onClick={() => {
                setHostDetailDialogOpen(false);
                setAddHostDialogOpen(true);
              }}
            >
              {t('hostGroups.hosts.addHost')}
            </Button>
          </Box>
        </DialogTitle>
        <DialogContent dividers>
          <TextField
            fullWidth
            size="small"
            placeholder={t('hostGroups.hosts.searchPlaceholder')}
            value={hostSearchQuery}
            onChange={(e) => {
              setHostSearchQuery(e.target.value);
              setHostPage(0);
            }}
            sx={{ mb: 2 }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon />
                </InputAdornment>
              ),
            }}
          />
          
          {(() => {
            const currentHosts = groupHosts[selectedGroup?.id || ''] || [];
            const filteredHosts = getFilteredHosts(currentHosts);
            const paginatedHosts = getPaginatedHosts(currentHosts);
            
            return currentHosts.length === 0 ? (
              <Alert severity="info">{t('hostGroups.hosts.noHosts')}</Alert>
            ) : filteredHosts.length === 0 ? (
              <Alert severity="warning">{t('hostGroups.hosts.noHostsFound')}</Alert>
            ) : (
              <>
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>{t('hostGroups.hosts.hostName')}</TableCell>
                        <TableCell>{t('hostGroups.hosts.ipAddress')}</TableCell>
                        <TableCell align="center">{t('hostGroups.hosts.port')}</TableCell>
                        <TableCell align="center">{t('hostGroups.hosts.type')}</TableCell>
                        <TableCell align="center">{t('common.status')}</TableCell>
                        <TableCell align="right">{t('common.actions')}</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {paginatedHosts.map((host) => (
                        <TableRow key={host.id} hover>
                          <TableCell>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <ComputerIcon color="primary" fontSize="small" />
                              <Typography variant="body2">{host.name}</Typography>
                            </Box>
                          </TableCell>
                          <TableCell>
                            <Chip label={host.ip} size="small" variant="outlined" />
                          </TableCell>
                          <TableCell align="center">{host.port}</TableCell>
                          <TableCell align="center">
                            <Chip label={host.deviceType} size="small" />
                          </TableCell>
                          <TableCell align="center">
                            <Chip
                              icon={host.status === 'online' ? <OnlineIcon /> : <OfflineIcon />}
                              label={host.status}
                              size="small"
                              color={host.status === 'online' ? 'success' : 'default'}
                            />
                          </TableCell>
                          <TableCell align="right">
                            <IconButton
                              size="small"
                              onClick={() => {
                                handleRemoveHost(host.id);
                              }}
                              disabled={selectedGroup?.name === 'Default'}
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
                <TablePagination
                  component="div"
                  count={filteredHosts.length}
                  page={hostPage}
                  onPageChange={(_e, newPage) => setHostPage(newPage)}
                  rowsPerPage={hostRowsPerPage}
                  onRowsPerPageChange={(e) => {
                    setHostRowsPerPage(parseInt(e.target.value, 10));
                    setHostPage(0);
                  }}
                  rowsPerPageOptions={[10, 25, 50, 100]}
                  labelRowsPerPage={t('hostGroups.pagination.rowsPerPage')}
                  labelDisplayedRows={({ from, to, count }) => t('hostGroups.pagination.displayedRows', { from, to, count })}
                />
              </>
            );
          })()}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => {
            setHostDetailDialogOpen(false);
            setHostSearchQuery('');
            setHostPage(0);
          }}>
            {t('hostGroups.actions.close')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* 添加主机对话框 */}
      <Dialog 
        open={addHostDialogOpen} 
        onClose={() => {
          setAddHostDialogOpen(false);
          setSelectedHosts([]);
          setHostSearchQuery('');
          setHostPage(0);
        }}
        maxWidth="md" 
        fullWidth
      >
        <DialogTitle>{t('hostGroups.hosts.addToGroup')}</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {t('hostGroups.hosts.addToGroupDesc', { name: selectedGroup?.name })}
          </Typography>
          
          <TextField
            fullWidth
            size="small"
            placeholder={t('hostGroups.hosts.searchPlaceholder')}
            value={hostSearchQuery}
            onChange={(e) => {
              setHostSearchQuery(e.target.value);
              setHostPage(0);
            }}
            sx={{ mb: 2 }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon />
                </InputAdornment>
              ),
            }}
          />
          
          {(() => {
            const availableHosts = getAvailableHosts();
            const filteredHosts = getFilteredHosts(availableHosts);
            const paginatedHosts = getPaginatedHosts(availableHosts);
            
            return availableHosts.length === 0 ? (
              <Alert severity="info">{t('hostGroups.hosts.allInGroup')}</Alert>
            ) : filteredHosts.length === 0 ? (
              <Alert severity="warning">{t('hostGroups.hosts.noHostsFound')}</Alert>
            ) : (
              <>
                <Box sx={{ mb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography variant="body2" color="text.secondary">
                    {t('hostGroups.hosts.selectedCount', { count: selectedHosts.length })}
                  </Typography>
                  <Button
                    size="small"
                    onClick={() => {
                      if (selectedHosts.length === filteredHosts.length) {
                        setSelectedHosts([]);
                      } else {
                        setSelectedHosts(filteredHosts.map(h => h.id));
                      }
                    }}
                  >
                    {selectedHosts.length === filteredHosts.length ? t('hostGroups.hosts.deselectAll') : t('hostGroups.hosts.selectAll')}
                  </Button>
                </Box>
                
                <List sx={{ maxHeight: 400, overflow: 'auto' }}>
                  {paginatedHosts.map((host) => (
                    <ListItem 
                      key={host.id} 
                      dense 
                      sx={{ 
                        border: '1px solid',
                        borderColor: 'divider',
                        borderRadius: 1,
                        mb: 1,
                      }}
                    >
                      <Checkbox
                        checked={selectedHosts.includes(host.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedHosts([...selectedHosts, host.id]);
                          } else {
                            setSelectedHosts(selectedHosts.filter(id => id !== host.id));
                          }
                        }}
                      />
                      <ComputerIcon sx={{ mr: 1, color: 'primary.main' }} />
                      <ListItemText
                        primary={host.name}
                        secondary={
                          <Stack direction="row" spacing={0.5} sx={{ mt: 0.5 }}>
                            <Chip label={host.ip} size="small" variant="outlined" />
                            <Chip
                              icon={host.status === 'online' ? <OnlineIcon /> : <OfflineIcon />}
                              label={host.status}
                              size="small"
                              color={host.status === 'online' ? 'success' : 'default'}
                            />
                            <Chip label={host.deviceType} size="small" />
                          </Stack>
                        }
                      />
                    </ListItem>
                  ))}
                </List>
                
                <TablePagination
                  component="div"
                  count={filteredHosts.length}
                  page={hostPage}
                  onPageChange={(_e, newPage) => setHostPage(newPage)}
                  rowsPerPage={hostRowsPerPage}
                  onRowsPerPageChange={(e) => {
                    setHostRowsPerPage(parseInt(e.target.value, 10));
                    setHostPage(0);
                  }}
                  rowsPerPageOptions={[10, 25, 50]}
                  labelRowsPerPage={t('hostGroups.pagination.rowsPerPage')}
                  labelDisplayedRows={({ from, to, count }) => t('hostGroups.pagination.displayedRows', { from, to, count })}
                />
              </>
            );
          })()}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => {
            setAddHostDialogOpen(false);
            setSelectedHosts([]);
            setHostSearchQuery('');
            setHostPage(0);
          }}>
            {t('hostGroups.actions.cancel')}
          </Button>
          <Button
            onClick={() => {
              handleAddHosts();
              setHostSearchQuery('');
              setHostPage(0);
            }}
            variant="contained"
            disabled={selectedHosts.length === 0}
          >
            {t('hostGroups.actions.add')} ({selectedHosts.length})
          </Button>
        </DialogActions>
      </Dialog>

      {/* 授权用户列表对话框 */}
      <Dialog 
        open={usersDialogOpen} 
        onClose={() => setUsersDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          授权用户列表 - {selectedGroup?.name}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2 }}>
            {groupUsers.length === 0 ? (
              <Alert severity="info">
                暂无用户被授权访问此分组
              </Alert>
            ) : (
              <List>
                {groupUsers.map((user, index) => (
                  <div key={user.id}>
                    {index > 0 && <Divider />}
                    <ListItem>
                      <Avatar sx={{ mr: 2, bgcolor: 'primary.main' }}>
                        {user.username?.[0]?.toUpperCase()}
                      </Avatar>
                      <ListItemText
                        primary={user.username}
                        secondary={
                          <Box>
                            <Typography variant="caption" display="block">
                              {user.email || '未设置邮箱'}
                            </Typography>
                            <Chip 
                              label={user.role === 'admin' ? '管理员' : '普通用户'} 
                              size="small"
                              color={user.role === 'admin' ? 'error' : 'default'}
                              sx={{ mt: 0.5 }}
                            />
                            {user.status !== 'active' && (
                              <Chip 
                                label="已禁用" 
                                size="small"
                                color="warning"
                                sx={{ mt: 0.5, ml: 0.5 }}
                              />
                            )}
                          </Box>
                        }
                      />
                    </ListItem>
                  </div>
                ))}
              </List>
            )}
            <Box sx={{ mt: 2, p: 2, bgcolor: 'background.default', borderRadius: 1 }}>
              <Typography variant="body2" color="text.secondary">
                 提示：在"用户管理"页面可以为用户分配分组权限
              </Typography>
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setUsersDialogOpen(false)}>
            关闭
          </Button>
        </DialogActions>
      </Dialog>

      {/* 删除分组确认对话框 */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>{t('hostGroups.dialog.delete')}</DialogTitle>
        <DialogContent>
          <Typography>
            {t('hostGroups.dialog.deleteConfirm', { name: selectedGroup?.name })}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            {t('hostGroups.dialog.deleteNote')}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>{t('hostGroups.actions.cancel')}</Button>
          <Button onClick={handleDeleteGroup} color="error" variant="contained">
            {t('hostGroups.actions.confirmDelete')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

